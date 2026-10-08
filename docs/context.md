# Project Context: Stubble Burning Early Warning System

## Problem Statement
Every October and November, crop-residue fires (stubble burning) in Punjab, Haryana, and western Uttar Pradesh contribute significantly to the hazardous air quality and smoke that reaches the Delhi NCR region. 

## Project Goal
This project is an AWS hackathon prototype for the "Air" track. The goal is to build an **early-warning indicator** that detects these crop fires using satellite data, determines if the wind is carrying the smoke toward Delhi, estimates the arrival time, and sends plain-language advisories in Hindi and English. It is intentionally designed as an end-to-end indicator pipeline rather than a complex machine-learning smoke dispersion model.

## Key Constraints & Focus
- **Timeframe:** Must be completed in 2 days.
- **Focus:** Working end-to-end flow is more important than model sophistication.
- **Out of Scope for Hackathon:** Real atmospheric dispersion modeling, SMS to Indian numbers (due to DLT registration delays), and farmer-facing flows.

## Architecture Highlights
- **Backend:** Python script running on AWS Lambda, triggered by EventBridge every 1-3 hours.
- **Data Ingestion:** NASA FIRMS API (for fire detection) and Open-Meteo API (for wind speed/direction).
- **Advisory Generation:** Amazon Bedrock generates Hindi/English alerts.
- **Storage & Frontend:** AWS S3 stores a `snapshot.json` and hosts a Leaflet.js static map.
- **Notifications:** Amazon SNS for email alerts.

## Current State
- The detailed implementation plan, timeline, and task splits are documented in `walkthrough.md`.
