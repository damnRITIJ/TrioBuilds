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
DEFAULT_TARGET = {"lat": 28.6139, "lon": 77.2090, "name": "Delhi"}
BBOX_PADDING_DEG = 3.0          # ~330km radius for fire search
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

def calculate_bounding_box(lat: float, lon: float, padding: float = BBOX_PADDING_DEG) -> str:
    """Calculate a square bounding box (lon_min,lat_min,lon_max,lat_max) around target."""
    lat_min, lat_max = lat - padding, lat + padding
    lon_min, lon_max = lon - padding, lon + padding
    # FIRMS expects: West, South, East, North (lon_min, lat_min, lon_max, lat_max)
    return f"{lon_min:.2f},{lat_min:.2f},{lon_max:.2f},{lat_max:.2f}"

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


def bearing_to_target(lat: float, lon: float, target_lat: float, target_lon: float) -> float:
    """
    Compute the compass bearing (0–360°) from (lat, lon) to target.
    0° = North, 90° = East, etc.
    """
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2, lon2 = math.radians(target_lat), math.radians(target_lon)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def is_upwind(wind_direction_deg: float, bearing_deg: float, dist: float) -> bool:
    """
    The FIRMS/Open-Meteo wind direction is the direction the wind comes FROM.
    Adding 180° gives the direction it is GOING (i.e. where smoke travels).
    Return True if smoke is heading toward the target.
    Tolerance tightens as distance increases to avoid massive wide cones at long ranges.
    """
    smoke_heading = (wind_direction_deg + 180) % 360
    diff = abs(smoke_heading - bearing_deg) % 360
    if diff > 180:
        diff = 360 - diff
        
    # Dynamic tolerance: 45° at 0km, shrinking down to 10° at >500km
    tolerance = max(10, 45 - (dist / 15))
    return diff <= tolerance


def score_clusters(clusters: list[dict], target_lat: float, target_lon: float) -> tuple[str, list[dict]]:
    """
    Annotate each cluster with upwind status, distance, and arrival time.
    Compute an overall risk level: 'Low', 'Moderate', or 'High'.
    Returns (risk_level, annotated_clusters).
    """
    upwind_frp_total = 0.0

    for c in clusters:
        dist = haversine_distance_km(c["lat"], c["lon"], target_lat, target_lon)
        bearing = bearing_to_target(c["lat"], c["lon"], target_lat, target_lon)
        
        speed = max(c["wind_speed_kmh"], 1)   # avoid division by zero
        upwind = is_upwind(c["wind_direction_deg"], bearing, dist)
        
        # Estimated hours for smoke to reach target
        arrival_hrs = dist / speed if upwind else None
        
        # If ETA is over 48 hours, weather will change before smoke arrives. Discard as threat.
        if arrival_hrs and arrival_hrs > 48:
            upwind = False
            arrival_hrs = None

        c["distance_km"] = round(dist, 1)
        c["bearing_to_target"] = round(bearing, 1)
        c["is_upwind"] = upwind
        c["arrival_hrs"] = round(arrival_hrs, 1) if arrival_hrs is not None else None

        if upwind:
            # Proper inverse-distance weight: drops below 1 for fires > 300km away. 
            # Cap max weight at 3.0 for fires < 100km to avoid singular massive spikes.
            weight = min(3.0, 300 / max(dist, 100))
            
            # Stagnation penalty: Low wind (< 5km/h) close to city (< 100km) causes severe accumulation
            if speed < 5 and dist < 100:
                weight *= 1.5
                
            upwind_frp_total += c["total_frp"] * weight

    # Guarantee minimum 'Moderate' if there are multiple upwind threats (fixes UI disconnect)
    if upwind_frp_total >= RISK_HIGH_FRP:
        risk = "High"
    elif upwind_frp_total >= RISK_MODERATE_FRP or (any(c["is_upwind"] for c in clusters) and upwind_frp_total > 50):
        risk = "Moderate"
    else:
        risk = "Low"

    logger.info(f"Risk: {risk} (weighted upwind FRP={upwind_frp_total:.1f})")
    return risk, clusters


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Bedrock Advisory
# ─────────────────────────────────────────────────────────────────────────────

def generate_advisory(risk: str, clusters: list[dict], target_name: str) -> dict:
    """
    Build a structured summary and call Amazon Bedrock (Claude) to generate
    a short, bilingual advisory. Returns {"en": "...", "hi": "..."}.

    Falls back to a template advisory if Bedrock is unavailable.
    """
    import boto3

    upwind = [c for c in clusters if c.get("is_upwind")]
    nearest = min(upwind, key=lambda x: x["distance_km"]) if upwind else None
    nearest_dist = nearest["distance_km"] if nearest else "N/A"
    arrival = nearest["arrival_hrs"] if nearest else "N/A"

    summary = (
        f"Active crop-fire clusters upwind of {target_name}: {len(upwind)}. "
        f"Nearest upwind cluster: {nearest_dist} km. "
        f"Estimated smoke arrival: {arrival} hours. "
        f"Overall risk level: {risk}."
    )

    prompt = f"""You are an air-quality advisory system. Based on the data below, write short advisories:
1. For Citizens (English and Hindi, 2 sentences each).
2. For Authorities (English and Hindi, 2 sentences each, more technical).

Data: {summary}

Respond ONLY with valid JSON in this exact format:
{{"citizens": {{"en": "...", "hi": "..."}}, "authorities": {{"en": "...", "hi": "..."}}}}"""

    try:
        from botocore.config import Config
        client = boto3.client("bedrock-runtime", region_name="us-east-1", config=Config(retries={'max_attempts': 0}))
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}],
        })
        response = client.invoke_model(modelId=BEDROCK_MODEL_ID, body=body)
        raw = json.loads(response["body"].read())
        text = raw["content"][0]["text"].strip()
        advisory = json.loads(text)
    except Exception as e:
        logger.warning(f"Bedrock call failed ({e}), using fallback advisory")
        advisory = {
            "citizens": {
                "en": f"Risk level is {risk}. {len(upwind)} fire clusters detected upwind of {target_name}. Stay alert.",
                "hi": f"जोखिम स्तर: {risk}। {target_name} की ओर {len(upwind)} अग्नि समूह पाए गए। सतर्क रहें।"
            },
            "authorities": {
                "en": f"Risk level is {risk}. {len(upwind)} fire clusters detected upwind of {target_name}. Estimated smoke arrival in {arrival} hours.",
                "hi": f"जोखिम स्तर: {risk}। {target_name} की ओर {len(upwind)} अग्नि समूह पाए गए। अनुमानित धुआं पहुंचने का समय: {arrival} घंटे।"
            }
        }

    return advisory


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Write Snapshot to S3
# ─────────────────────────────────────────────────────────────────────────────

def write_snapshot(bucket: str, risk: str, clusters: list[dict], advisory: dict) -> None:
    """Serialize analysis results to snapshot.json and upload to S3."""
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

    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key="snapshot.json",
        Body=json.dumps(snapshot, indent=2),
        ContentType="application/json",
    )
    logger.info(f"snapshot.json written to s3://{bucket}/snapshot.json")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — SNS Alert
# ─────────────────────────────────────────────────────────────────────────────

def send_sns_alert(topic_arn: str, risk: str, advisory: dict) -> None:
    """Publish an SNS alert when risk is High."""
    if not topic_arn:
        logger.warning("SNS_TOPIC_ARN not set — skipping alert")
        return

    import boto3
    try:
        region = topic_arn.split(":")[3] if ":" in topic_arn else "ap-southeast-2"
        sns = boto3.client("sns", region_name=region)
        message = (
            f"🚨 STUBBLEWATCH EARLY WARNING ALERT 🚨\n"
            f"Overall Risk Level: {risk}\n\n"
            f"--- CITIZENS ADVISORY ---\n"
            f"EN: {advisory['citizens']['en']}\n"
            f"HI: {advisory['citizens']['hi']}\n\n"
            f"--- AUTHORITIES ADVISORY ---\n"
            f"EN: {advisory['authorities']['en']}\n"
            f"HI: {advisory['authorities']['hi']}\n"
        )
        sns.publish(
            TopicArn=topic_arn,
            Subject=f"🔴 StubbleWatch Alert — Risk: {risk}"[:100],
            Message=message,
        )
        logger.info("SNS alert published successfully")
    except Exception as e:
        logger.error(f"SNS publish failed: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Lambda Handler
# ─────────────────────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """Main entry point triggered by API Gateway or EventBridge."""
    logger.info("Pipeline started")

    qps = event.get("queryStringParameters") or {}
    
    # Handle Test Alert Simulation Endpoint (Dispatches live SNS email)
    if qps.get("action") == "test_alert":
        city = qps.get("city", DEFAULT_TARGET["name"])
        test_advisory = {
            "citizens": {
                "en": f"High risk of stubble smoke drifting towards {city}. Keep windows closed and avoid outdoor activities.",
                "hi": f"धुआं {city} की ओर बढ़ने का उच्च जोखिम है। खिड़कियां बंद रखें और बाहरी गतिविधियों से बचें।"
            },
            "authorities": {
                "en": f"Critical multi-cluster thermal anomalies detected upwind of {city}. Prepare for severe PM2.5 AQI degradation within 4-8 hours.",
                "hi": f"अपविंड में कई उच्च-तीव्रता वाली तापीय विसंगतियाँ पाई गई हैं। अगले 4-8 घंटों में {city} की वायु गुणवत्ता (PM2.5) में भारी गिरावट के लिए तैयार रहें।"
            }
        }
        if SNS_TOPIC_ARN:
            try:
                send_sns_alert(SNS_TOPIC_ARN, "High", test_advisory)
                return {
                    "statusCode": 200,
                    "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"status": "test_alert_sent", "advisory": test_advisory})
                }
            except Exception as e:
                logger.error(f"Test alert failed: {e}")
                return {
                    "statusCode": 500,
                    "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"error": f"Failed to send test alert: {str(e)}"})
                }
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing SNS_TOPIC_ARN"})
        }

    # Handle SNS Subscription Endpoint
    if qps.get("action") == "subscribe":
        email = qps.get("email")
        if email and SNS_TOPIC_ARN:
            try:
                import boto3
                sns = boto3.client("sns")
                sns.subscribe(TopicArn=SNS_TOPIC_ARN, Protocol="email", Endpoint=email)
                return {
                    "statusCode": 200, 
                    "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}, 
                    "body": json.dumps({"status": "success"})
                }
            except Exception as e:
                logger.error(f"SNS subscribe failed: {e}")
                return {
                    "statusCode": 500,
                    "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"error": f"Failed to subscribe: {str(e)}"})
                }
        return {
            "statusCode": 400, 
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}, 
            "body": json.dumps({"error": "Missing email or SNS_TOPIC_ARN"})
        }

    target_lat = float(qps.get("lat", DEFAULT_TARGET["lat"]))
    target_lon = float(qps.get("lon", DEFAULT_TARGET["lon"]))
    target_name = qps.get("city", DEFAULT_TARGET["name"])

    # 1. Fetch fire data (7 days for better demo visibility)
    bbox = calculate_bounding_box(target_lat, target_lon)
    fires = fetch_fires(FIRMS_MAP_KEY, bbox, days=5)
    
    def build_response(risk, clusters, advisory):
        upwind_clusters = [c for c in clusters if c.get("is_upwind")]
        snapshot = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "target": {"name": target_name, "lat": target_lat, "lon": target_lon},
            "risk_level": risk,
            "upwind_clusters": upwind_clusters,
            "all_clusters": clusters,
            "advisory": advisory,
        }
        if S3_BUCKET:
            try:
                write_snapshot(S3_BUCKET, risk, clusters, advisory)
            except Exception as e:
                logger.error(f"S3 upload failed: {e}")
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps(snapshot)
        }

    if not fires:
        logger.info("No fires detected — writing Low-risk snapshot")
        advisory = {
            "citizens": {"en": f"No active fires detected near {target_name}. Airspace clear.", "hi": "कोई सक्रिय आग नहीं पाई गई। वायुमार्ग साफ है।"},
            "authorities": {"en": f"All air quality parameters stable. No immediate thermal anomalies near {target_name}.", "hi": "सभी वायु गुणवत्ता पैरामीटर स्थिर हैं। कोई विसंगति नहीं।"}
        }
        return build_response("Low", [], advisory)

    # 2. Cluster fires
    clusters = cluster_fires(fires)

    # 3. Fetch wind per cluster
    clusters = fetch_wind_for_clusters(clusters)

    # 4. Score risk
    risk, clusters = score_clusters(clusters, target_lat, target_lon)

    # 5. Generate advisory
    advisory = generate_advisory(risk, clusters, target_name)

    # 6. Alert if High
    if risk == "High":
        send_sns_alert(SNS_TOPIC_ARN, risk, advisory)

    logger.info("Pipeline complete")
    return build_response(risk, clusters, advisory)

if __name__ == "__main__":
    # Provides an easy way to run and test the script locally!
    lambda_handler({}, None)
