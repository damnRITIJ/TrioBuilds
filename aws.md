# AWS Implementation & Setup Context

This file logs the setup, configuration, and troubleshooting steps taken to configure the backend pipeline of the StubbleWatch project.

## 1. Environment Variable Management
We moved away from hardcoded defaults in the backend and adopted a strict `.env` file approach for local development and testing.

- **Changes made**: 
  - Created `.env` (ignored by git) and `.env.example` (committed as a template).
  - Modified `backend/requirements.txt` to include `python-dotenv==1.0.1`.
  - Updated `backend/lambda_function.py` to use `dotenv.load_dotenv(override=True)` to forcefully load variables from the `.env` file before executing any logic.
  - Stripped out all hardcoded placeholder fallbacks (like `"DEMO_KEY"`) from `os.environ.get()` calls.

## 2. AWS Credentials & Authentication
Because `boto3` was being run locally for testing (before deploying to Lambda), it crashed with a `NoCredentialsError`.

- **Resolution**: We added IAM User credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`) directly to the local `.env` file. `boto3` automatically detects these when `dotenv` loads them into the environment, successfully authenticating the local script with AWS.

## 3. S3 Express One Zone Permissions
During testing, the script successfully hit the NASA FIRMS API, but threw an `AccessDenied` error when uploading the `snapshot.json` to S3.
- **Cause**: The bucket (`triobuild--apse2-az1--x-s3`) is an **S3 Express One Zone** directory bucket.
- **Resolution**: Attached the `s3express:CreateSession` and `s3express:PutObject` policies to the IAM user executing the code. 

## 4. End-to-End Test Success
After resolving the permissions, the backend pipeline executed flawlessly:
1. Checked NASA FIRMS for fires (currently 0 detected due to weather/seasonality).
2. Because 0 fires were detected, the pipeline smartly bypassed the Open-Meteo API and Amazon Bedrock generation to save costs and compute.
3. Automatically formulated a "Low" risk `snapshot.json` payload.
4. Uploaded `snapshot.json` to the S3 bucket successfully with `code 0` (no errors).

## Next Steps for the Hackathon
- **Replay Mode**: Setup the frontend to use `mock_data.json` so the demo has a high-risk map to show the judges, instead of a blank "Low Risk" map.
- **Frontend Integration**: Hook up the Leaflet map to pull the `snapshot.json` from the S3 bucket URL.
