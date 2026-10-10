"""
Stubble Burning Early Warning System — Lambda Handler
Pipeline: EventBridge → Lambda → S3 (snapshot.json) + SNS (if High risk)
"""

import json
import math
import os
import csv
import io
import logging
from datetime import datetime, timezone

import requests
try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    load_dotenv(dotenv_path=env_path, override=True)
except ImportError:
    pass

# ── Logging ──────────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Constants ─────────────────────────────────────────────────────────────────
DELHI = {"lat": 28.6139, "lon": 77.2090}
BOUNDING_BOX = "73,28,80,31"   # lon_min, lat_min, lon_max, lat_max (Punjab/Haryana/W-UP)
GRID_DEGREES = 0.1              # ~10 km grid for clustering
UPWIND_TOLERANCE_DEG = 30       # ±30° cone toward Delhi counts as "upwind"
RISK_HIGH_FRP = 500             # Cumulative FRP threshold for High risk
RISK_MODERATE_FRP = 150         # Cumulative FRP threshold for Moderate risk

# ── Environment variables (set in Lambda console / SAM template / .env) ────────
FIRMS_MAP_KEY = os.environ.get("FIRMS_MAP_KEY")
S3_BUCKET = os.environ.get("S3_BUCKET")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Fire Detection (NASA FIRMS)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_fires(map_key: str, bbox: str, days: int = 1) -> list[dict]:
    """
    Fetch VIIRS fire detections from NASA FIRMS for the last `days` days
    within the given bounding box.

    Returns a list of fire dicts with keys: lat, lon, frp, confidence.
    Only 'high' and 'nominal' confidence detections are kept.
    """
    url = (
        f"https://firms.modaps.eosdis.nasa.gov/api/area/csv"
        f"/{map_key}/VIIRS_SNPP_NRT/{bbox}/{days}"
    )
    logger.info(f"Fetching FIRMS data: {url}")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()

    fires = []
    reader = csv.DictReader(io.StringIO(resp.text))
    for row in reader:
        confidence = row.get("confidence", "").lower()
        if confidence not in ("high", "nominal", "n"):   # drop 'l' (low)
            continue
        fires.append({
            "lat": float(row["latitude"]),
            "lon": float(row["longitude"]),
            "frp": float(row.get("frp", 0) or 0),
            "confidence": confidence,
        })

    logger.info(f"Fetched {len(fires)} high/nominal confidence fire points")
    return fires


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Clustering
# ─────────────────────────────────────────────────────────────────────────────

def cluster_fires(fires: list[dict], grid: float = GRID_DEGREES) -> list[dict]:
    """
    Round each fire to a ~10 km grid cell and aggregate FRP per cell.
    Returns a list of cluster dicts: lat, lon (cell centroid), total_frp, count.
    """
    cells: dict[tuple, dict] = {}
    for f in fires:
        key = (round(f["lat"] / grid) * grid, round(f["lon"] / grid) * grid)
        if key not in cells:
            cells[key] = {"lat": key[0], "lon": key[1], "total_frp": 0.0, "count": 0}
        cells[key]["total_frp"] += f["frp"]
        cells[key]["count"] += 1

    clusters = list(cells.values())
    logger.info(f"Clustered into {len(clusters)} grid cells")
    return clusters


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Wind Fetching (Open-Meteo)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_wind_for_clusters(clusters: list[dict]) -> list[dict]:
    """
    For each cluster, fetch current wind speed (km/h) and direction (°)
    from the Open-Meteo API.  Adds 'wind_speed_kmh' and 'wind_direction_deg'
    keys to each cluster dict in place.
    """
    # Batch all coordinates into one API call using comma-separated params
    lats = ",".join(str(c["lat"]) for c in clusters)
    lons = ",".join(str(c["lon"]) for c in clusters)
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        f"&current=wind_speed_10m,wind_direction_10m"
        f"&wind_speed_unit=kmh&timezone=Asia%2FKolkata"
    )
    logger.info(f"Fetching wind for {len(clusters)} clusters")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # API returns a list when multiple locations are requested
    if isinstance(data, dict):
        data = [data]

    for i, cluster in enumerate(clusters):
        current = data[i].get("current", {})
        cluster["wind_speed_kmh"] = current.get("wind_speed_10m", 0)
        cluster["wind_direction_deg"] = current.get("wind_direction_10m", 0)

    return clusters


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Core Scoring Logic
# ─────────────────────────────────────────────────────────────────────────────

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in km between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing_to_delhi(lat: float, lon: float) -> float:
    """
    Compute the compass bearing (0–360°) from (lat, lon) to Delhi.
    0° = North, 90° = East, etc.
    """
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2, lon2 = math.radians(DELHI["lat"]), math.radians(DELHI["lon"])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def is_upwind(wind_direction_deg: float, bearing_deg: float, tolerance: float = UPWIND_TOLERANCE_DEG) -> bool:
    """
    The FIRMS/Open-Meteo wind direction is the direction the wind comes FROM.
    Adding 180° gives the direction it is GOING (i.e. where smoke travels).
    Return True if smoke is heading toward Delhi within `tolerance` degrees.
    """
    smoke_heading = (wind_direction_deg + 180) % 360
    diff = abs(smoke_heading - bearing_deg) % 360
    if diff > 180:
        diff = 360 - diff
    return diff <= tolerance


def score_clusters(clusters: list[dict]) -> tuple[str, list[dict]]:
    """
    Annotate each cluster with upwind status, distance, and arrival time.
    Compute an overall risk level: 'Low', 'Moderate', or 'High'.
    Returns (risk_level, annotated_clusters).
    """
    upwind_frp_total = 0.0

    for c in clusters:
        dist = haversine_distance_km(c["lat"], c["lon"], DELHI["lat"], DELHI["lon"])
        bearing = bearing_to_delhi(c["lat"], c["lon"])
        upwind = is_upwind(c["wind_direction_deg"], bearing)

        # Estimated hours for smoke to reach Delhi
        speed = max(c["wind_speed_kmh"], 1)   # avoid division by zero
        arrival_hrs = dist / speed if upwind else None

        c["distance_km"] = round(dist, 1)
        c["bearing_to_delhi"] = round(bearing, 1)
        c["is_upwind"] = upwind
        c["arrival_hrs"] = round(arrival_hrs, 1) if arrival_hrs is not None else None

        if upwind:
            # Weight FRP by proximity (closer fires score higher)
            weight = max(1, 300 / max(dist, 1))
            upwind_frp_total += c["total_frp"] * weight

    if upwind_frp_total >= RISK_HIGH_FRP:
        risk = "High"
    elif upwind_frp_total >= RISK_MODERATE_FRP:
        risk = "Moderate"
    else:
        risk = "Low"

    logger.info(f"Risk: {risk} (weighted upwind FRP={upwind_frp_total:.1f})")
    return risk, clusters


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Bedrock Advisory
# ─────────────────────────────────────────────────────────────────────────────

def generate_advisory(risk: str, clusters: list[dict]) -> dict:
    """
    Build a structured summary and call Amazon Bedrock to generate
    a short, bilingual advisory. Returns {"en": "...", "hi": "..."}.

    Falls back to a template advisory if Bedrock is unavailable or verifying.
    """
    import boto3

    upwind = [c for c in clusters if c.get("is_upwind")]
    nearest = min(upwind, key=lambda x: x["distance_km"]) if upwind else None
    nearest_dist = nearest["distance_km"] if nearest else "N/A"
    arrival = nearest["arrival_hrs"] if nearest else "N/A"

    summary = (
        f"Active crop-fire clusters upwind of Delhi: {len(upwind)}. "
        f"Nearest upwind cluster: {nearest_dist} km. "
        f"Estimated smoke arrival: {arrival} hours. "
        f"Overall risk level: {risk}."
    )

    fallback_advisory = {
        "en": f"Risk level is {risk}. {len(upwind)} fire cluster(s) detected upwind of Delhi. Estimated smoke arrival in {arrival} hours.",
        "hi": f"जोखिम स्तर: {risk}। दिल्ली की ओर {len(upwind)} अग्नि समूह पाए गए। अनुमानित धुआं पहुंचने का समय: {arrival} घंटे।",
    }

    if not BEDROCK_MODEL_ID:
        return fallback_advisory

    prompt = (
        "You are an air-quality early warning system. Based on the data below, write two concise advisories:\n"
        "1. In English (2 sentences, for city authorities and residents).\n"
        "2. In Hindi (2 sentences, for Hindi-speaking residents).\n\n"
        f"Data: {summary}\n\n"
        'Respond ONLY with valid JSON in this exact structure: {"en": "...", "hi": "..."}'
    )

    region = os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2")
    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        # Use Bedrock Converse API for broad model compatibility (Nova, Claude, etc.)
        response = client.converse(
            modelId=BEDROCK_MODEL_ID,
            messages=[{"role": "user", "content": [{"text": prompt}]}]
        )
        text = response["output"]["message"]["content"][0]["text"].strip()
        # Clean any markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        advisory = json.loads(text)
    except Exception as e:
        logger.warning(f"Bedrock call notice ({e}), using reliable fallback advisory")
        advisory = fallback_advisory

    return advisory


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Write Snapshot to S3 & Local
# ─────────────────────────────────────────────────────────────────────────────

def write_snapshot(bucket: str, risk: str, clusters: list[dict], advisory: dict) -> None:
    """Serialize analysis results to snapshot.json, upload to S3, and save locally."""
    import boto3

    upwind_clusters = [
        {k: c[k] for k in ("lat", "lon", "total_frp", "distance_km", "arrival_hrs", "wind_speed_kmh", "wind_direction_deg")}
        for c in clusters if c.get("is_upwind")
    ]

    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "risk_level": risk,
        "upwind_clusters": upwind_clusters,
        "all_clusters": clusters,
        "advisory": advisory,
    }
    json_data = json.dumps(snapshot, indent=2)

    # Clean bucket name if full ARN was passed
    clean_bucket = (bucket or "").replace("arn:aws:s3:::", "").strip()

    if clean_bucket:
        try:
            s3 = boto3.client("s3")
            s3.put_object(
                Bucket=clean_bucket,
                Key="snapshot.json",
                Body=json_data,
                ContentType="application/json",
            )
            logger.info(f"snapshot.json uploaded to s3://{clean_bucket}/snapshot.json")
        except Exception as e:
            logger.warning(f"Could not upload snapshot to S3: {e}")

    # Also save to local frontend folder for instant local dashboard rendering
    local_paths = [
        os.path.join(os.path.dirname(__file__), "..", "frontend", "snapshot.json"),
        os.path.join(os.path.dirname(__file__), "..", "snapshot.json")
    ]
    for p in local_paths:
        try:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(json_data)
            logger.info(f"snapshot.json written locally to {p}")
        except Exception as e:
            logger.debug(f"Local file write note for {p}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — SNS Alert
# ─────────────────────────────────────────────────────────────────────────────

def send_sns_alert(topic_arn: str, risk: str, advisory: dict) -> None:
    """Publish an SNS alert when risk is High."""
    if not topic_arn:
        logger.warning("SNS_TOPIC_ARN not set — skipping alert")
        return

    import boto3
    # Determine region from ARN if present (e.g. arn:aws:sns:ap-southeast-2:...)
    region = os.environ.get("AWS_DEFAULT_REGION", "ap-southeast-2")
    if topic_arn.startswith("arn:aws:sns:"):
        parts = topic_arn.split(":")
        if len(parts) >= 4 and parts[3]:
            region = parts[3]

    try:
        sns = boto3.client("sns", region_name=region)
        sns.publish(
            TopicArn=topic_arn,
            Subject=f"🔴 Stubble Burning Alert — Risk: {risk}",
            Message=f"{advisory.get('en', '')}\n\n{advisory.get('hi', '')}",
        )
        logger.info(f"SNS alert published successfully to {topic_arn} in {region}")
    except Exception as e:
        logger.warning(f"Failed to publish SNS alert: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Lambda Handler
# ─────────────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """Main entry point triggered by EventBridge every 1-3 hours."""
    logger.info("Pipeline started")

    # 1. Fetch fire data
    fires = fetch_fires(FIRMS_MAP_KEY, BOUNDING_BOX)
    if not fires:
        logger.info("No fires detected — writing Low-risk snapshot")
        write_snapshot(S3_BUCKET, "Low", [], {"en": "No active fires detected.", "hi": "कोई सक्रिय आग नहीं पाई गई।"})
        return {"statusCode": 200, "body": "No fires"}

    # 2. Cluster fires
    clusters = cluster_fires(fires)

    # 3. Fetch wind per cluster
    clusters = fetch_wind_for_clusters(clusters)

    # 4. Score risk
    risk, clusters = score_clusters(clusters)

    # 5. Generate advisory
    advisory = generate_advisory(risk, clusters)

    # 6. Write snapshot to S3
    write_snapshot(S3_BUCKET, risk, clusters, advisory)

    # 7. Alert if High
    if risk == "High":
        send_sns_alert(SNS_TOPIC_ARN, risk, advisory)

    logger.info("Pipeline complete")
    return {"statusCode": 200, "body": f"Risk: {risk}"}

if __name__ == "__main__":
    # Provides an easy way to run and test the script locally!
    lambda_handler({}, None)
