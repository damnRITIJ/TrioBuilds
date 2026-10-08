# Agent Instructions & Guidelines

These rules apply when working on the Stubble Burning Early Warning System.

## General Behavior
- **Acknowledge the constraints:** This is a 2-day AWS hackathon prototype. Prioritize speed, simplicity, and a working end-to-end flow over over-engineering.
- **Focus on the "Happy Path":** Ensure the core pipeline works perfectly before adding edge-case handling or complex features.
- **Documentation:** Keep the `walkthrough.md` updated if architectural or scope changes occur.

## Coding Standards
- **Backend (Python):** 
  - Keep the Lambda function lightweight.
  - Use standard libraries (e.g., `math`) for geospatial calculations where possible to avoid heavy dependencies, except for `requests` which is necessary for APIs.
  - Write clear, concise comments explaining the logic, especially around the wind heading calculation (the `direction + 180 degrees` logic).
- **Frontend (HTML/JS/CSS):** 
  - Use Vanilla JS, CSS, and HTML. No heavy frameworks like React unless explicitly requested.
  - Ensure the map UI is clean, intuitive, and clearly displays the risk levels and time of arrival.
  - Follow modern design aesthetics: vibrant colors for risk indicators, dynamic animations, and a responsive layout to "wow" the hackathon judges.

## AWS Integration
- When writing infrastructure code or scripts, assume AWS services like S3, Lambda, EventBridge, Bedrock, and SNS are the primary tools.
- Do not suggest complex databases (like RDS) or API Gateways for this initial prototype. A single JSON snapshot dumped to S3 is the preferred method to connect the backend to the frontend.

## Mock Data & Testing
- Always provide mock data examples (e.g., a dummy `snapshot.json`) to allow the frontend to be developed in parallel with the backend.
- Ensure there is a "replay mode" configuration or script to simulate high-fire days for reliable demo purposes.
