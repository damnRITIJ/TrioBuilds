# 🔥 StubbleWatch — Delhi NCR Stubble Burning Early Warning System

> **AWS Hackathon — Air Track**
> An end-to-end early-warning pipeline that detects crop-residue fires from satellite data, checks if wind is carrying smoke toward Delhi, estimates arrival time, and sends bilingual (Hindi/English) advisories.

---

## Architecture

```
EventBridge (2 hr)
      ↓
  Lambda (Python)
  ├── NASA FIRMS API  →  fire detections
  ├── Open-Meteo API  →  wind per cluster
  ├── Scoring logic   →  upwind check + arrival time + risk level
  ├── Amazon Bedrock  →  Hindi + English advisory
  ├── Amazon S3       →  snapshot.json
  └── Amazon SNS      →  email alert (if High risk)
            ↓
  S3 Static Site (Leaflet.js map)
```

## Quick Start

### 1 — Prerequisites
- AWS CLI configured (`aws configure`)
- AWS SAM CLI installed (`brew install aws-sam-cli`)
- Python 3.12+
- NASA FIRMS MAP_KEY — register at https://firms.modaps.eosdis.nasa.gov/api/

### 2 — Install backend dependencies (local dev)
```bash
pip install -r backend/requirements.txt
```

### 3 — Run unit tests locally
```bash
python -m pytest backend/tests/test_logic.py -v
```

### 4 — Deploy to AWS
```bash
cd infrastructure
sam build
sam deploy --guided
```

Follow the prompts and provide:
- `FirmsMapKey` — your NASA FIRMS key
- `SnsSubscriberEmail` — your email for High-risk alerts
- Other defaults are fine for the hackathon

### 5 — Upload frontend to S3
```bash
aws s3 sync frontend/ s3://YOUR-BUCKET-NAME/ --acl public-read
```

### 6 — Update frontend config
Edit `frontend/app.js` and set `CONFIG.snapshotUrl` to your S3 snapshot URL (shown in SAM deploy outputs).

### 7 — Invoke Lambda manually for demo
```bash
aws lambda invoke \
  --function-name stubble-ingest-and-score \
  --payload '{}' \
  response.json && cat response.json
```

---

## Replay Mode (for demos outside Oct–Nov season)

Set `CONFIG.replayUrl` in `frontend/app.js` to a saved high-fire snapshot:

```js
replayUrl: "./assets/replay_snapshot.json",
```

A replay banner will appear on the map automatically.

---

## Project Structure

```
├── backend/
│   ├── lambda_function.py   ← Full pipeline logic
│   ├── requirements.txt
│   └── tests/
│       ├── test_logic.py    ← Unit tests
│       └── mock_data.json   ← High-fire day mock data
├── frontend/
│   ├── index.html           ← Map page
│   ├── styles.css           ← Dark-mode dashboard styles
│   └── app.js               ← Leaflet rendering + data fetch
├── infrastructure/
│   └── template.yaml        ← AWS SAM template
└── docs/
    ├── context.md
    ├── walkthrough.md
    └── agents.md
```

---

## Team Task Split

| Owner | Tasks |
|---|---|
| **Backend** | FIRMS + Open-Meteo ingestion, clustering, scoring, Lambda, EventBridge |
| **Cloud** | S3, SNS, Bedrock prompt + access, IAM permissions, SAM deploy |
| **Frontend** | Leaflet map, wind arrows, risk banner, language toggle, replay mode |
| **Everyone** | Replay snapshot, demo script, pitch slides |

---

## Key Environment Variables (Lambda)

| Variable | Description |
|---|---|
| `FIRMS_MAP_KEY` | NASA FIRMS API key |
| `S3_BUCKET` | S3 bucket name for `snapshot.json` |
| `SNS_TOPIC_ARN` | SNS topic ARN for email alerts |
| `BEDROCK_MODEL_ID` | Bedrock model (default: Claude 3 Haiku) |
