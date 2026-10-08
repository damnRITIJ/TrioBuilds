# Stubble Burning Early Warning: Implementation Plan & Roadmap

## 1. Overview
Every October and November, crop-residue fires in Punjab, Haryana and western Uttar Pradesh contribute to the smoke that reaches Delhi NCR. This project detects those fires from satellite data, checks whether the wind is carrying smoke toward Delhi, estimates when it will arrive, and sends a plain-language advisory in Hindi and English.

The prototype is an **early-warning indicator**, not a smoke dispersion model. The primary goal for the hackathon is to build a working end-to-end flow.

## 2. Scope

### In Scope
- Pull the last 24 hours of fire detections from NASA FIRMS.
- Pull wind speed and direction from Open-Meteo.
- Decide per fire cluster whether smoke is heading toward Delhi, and estimate arrival time.
- Score overall risk as Low, Moderate or High.
- Generate a bilingual advisory with Amazon Bedrock.
- Send an alert through Amazon SNS.
- Show everything on a Leaflet map hosted on S3.

### Out of Scope (Roadmap items for the pitch)
- Real atmospheric dispersion modelling.
- SMS to Indian numbers (needs DLT sender registration, which will not be done in 2 days).
- A farmer-facing flow suggesting alternatives such as Happy Seeder rental or biomass buyers.

## 3. Architecture

**Pipeline (Runs every 1-3 hrs via EventBridge):**
`EventBridge` -> `Lambda "ingest-and-score"`
- Fetches from NASA FIRMS API (fires, last 24h)
- Fetches from Open-Meteo API (wind at each fire cluster)
- Applies scoring logic (upwind check + arrival time)
- Calls Bedrock (Hindi/English advisory)
- Writes `snapshot.json` to S3
- If risk is high, publishes to SNS

**Frontend:**
S3 static site (Leaflet map) reads `snapshot.json`.

| Component | AWS Service | Role |
| :--- | :--- | :--- |
| Scheduler | EventBridge | Triggers the pipeline every 1-3 hours |
| Compute | Lambda | Ingestion, scoring, advisory, alerting |
| Storage & Hosting | S3 | `snapshot.json` and the static map site |
| Advisory Text | Bedrock | Short Hindi and English advisory generation |
| Alerts | SNS | Email alerts for the demo |

### Tech Stack

- **Backend Language:** Python (using `requests` for APIs, standard `math` for distance/bearing calculations).
- **Frontend Language:** HTML, CSS, Vanilla JavaScript.
- **Mapping Library:** Leaflet.js (loaded via CDN).
- **Compute & Orchestration:** AWS Lambda, AWS EventBridge.
- **AI & ML:** Amazon Bedrock.
- **Storage & Hosting:** Amazon S3 (for `snapshot.json` and Static Web Hosting).
- **Notifications:** Amazon SNS.

### Suggested File Structure

```text
stubble-warning-project/
│
├── backend/                  # Lambda function code
│   ├── lambda_function.py    # Main handler and core logic
│   ├── requirements.txt      # Python dependencies (requests, etc.)
│   └── tests/                # Unit tests for calculation logic
│       ├── test_logic.py
│       └── mock_data.json    # Fake data for testing
│
├── frontend/                 # Static website files (hosted on S3)
│   ├── index.html            # Main map page
│   ├── styles.css            # Custom styling
│   ├── app.js                # Fetches snapshot.json and renders Leaflet map
│   └── assets/               # Images or icons (if any)
│
├── infrastructure/           # IaC templates (Optional)
│   └── template.yaml         # AWS SAM / CloudFormation template
│
└── README.md                 # Project documentation
```

## 4. Data Sources

### NASA FIRMS
- **Source:** Use the VIIRS source (375 m resolution) as it is better than MODIS for small farm fires.
- **Access:** Register for a free `MAP_KEY`.
- **Query:** Use the area API with a bounding box covering Punjab, Haryana, and western UP.
- **Filtering:** Filter out low-confidence detections.

### Open-Meteo
- **Access:** Free, no API key needed.
- **Query:** Request hourly `wind_speed_10m` and `wind_direction_10m`. Batch multiple coordinates into one request.

## 5. Processing Steps

1. **Fetch fires:** Call the FIRMS area API for the last 24 hours and parse the CSV. Drop low-confidence rows.
2. **Cluster the fires:** Round coordinates to a roughly 10 km grid and sum the FRP (Fire Radiative Power) in each cell. This reduces weather API calls and improves map readability.
3. **Fetch wind per cluster:** Request hourly wind speed and direction from Open-Meteo for each grid cell.
4. **Core calculation (per cell):**
   - Compute the distance and compass bearing from the cell to Delhi.
   - Calculate wind travel direction (`wind comes from + 180 degrees`).
   - If that heading is within ~30 degrees of the bearing to Delhi, the cell counts as upwind.
   - Estimated arrival time = distance / wind speed.
5. **Score the risk:** Add up the FRP of upwind cells, weighted by closeness. Map the total to Low, Moderate, or High using predefined thresholds.
6. **Generate the advisory:** Send a structured summary (e.g., "12 upwind clusters, nearest 140 km, arrival 9 hrs, risk High") to Bedrock to generate a short bilingual advisory.
7. **Send alerts:** Publish to an SNS topic when risk crosses the high threshold.
8. **Build the map:** A Leaflet static page fetches `snapshot.json` from S3 and renders fire clusters, wind arrows, a line to Delhi, a risk banner, and a language toggle.

## 6. Two-Day Timeline

| When | Goal |
| :--- | :--- |
| **First hour** | Get the FIRMS MAP_KEY, request Bedrock model access, create the AWS resources |
| **Day 1 morning** | FIRMS and Open-Meteo calls working locally in Python, clustering done |
| **Day 1 afternoon** | Upwind and arrival logic, risk score, unit test with fake data, deploy Lambda with EventBridge schedule |
| **Day 2 morning** | Write snapshot to S3, Leaflet map, Bedrock advisory |
| **Day 2 afternoon** | SNS alert, polish, demo script |

## 7. Risks and Mitigations

| Risk | Mitigation |
| :--- | :--- |
| API key setup or Bedrock access delays | Do both in the first hour |
| Estimate is approximate | Label it an early-warning indicator in the UI |
| FIRMS detection delay of a few hours | State it openly; show data timestamps on the map |
| Live data is quiet/API is slow during demo | Keep a saved replay snapshot from a high-fire day |
| SMS to Indian numbers not possible in time | Use email plus a mock phone screen |
| Demo falls outside Stubble season (Oct-Nov) | Rely on replay mode |

## 8. Making the Demo Stronger
- **Replay mode:** Save a snapshot from a high-fire day so the demo always works reliably.
- **Timeline slider:** Add a "next 24 hours" slider using Open-Meteo's hourly forecast.
- **Roadmap slide:** Talk about future enhancements like farmer-facing alerts (Happy Seeder/biomass buyers), school/hospital alerts, and proper dispersion models.

## 9. Task Split Template

| Owner | Tasks |
| :--- | :--- |
| **Backend Person** | FIRMS & Open-Meteo ingestion, clustering, scoring, Lambda, EventBridge |
| **Cloud Person** | S3, SNS, Bedrock prompt and access, IAM permissions |
| **Frontend Person**| Leaflet map, wind arrows, risk banner, language toggle |
| **Everyone** | Replay snapshot, demo script, pitch slides |
