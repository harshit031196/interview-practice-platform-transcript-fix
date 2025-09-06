# Manual Google Cloud Setup Guide

If you prefer to set up Google Cloud services manually through the console, follow these steps:

## Project Details
- **Project ID**: `wingman-interview-470419`
- **Project Name**: Wingman Interview
- **Project Number**: 567547372194

## Step 1: Enable APIs

Go to [Google Cloud Console APIs](https://console.cloud.google.com/apis/library) and enable:

1. **Cloud Storage API**
2. **Cloud Functions API** 
3. **Speech-to-Text API**
4. **Video Intelligence API**
5. **Vertex AI API**

## Step 2: Create Storage Bucket

1. Go to [Cloud Storage](https://console.cloud.google.com/storage)
2. Click "Create Bucket"
3. **Name**: `wingman-interview-videos-470419`
4. **Location**: `us-central1` (single region)
5. **Storage Class**: Standard
6. **Access Control**: Uniform
7. Click "Create"

### Configure CORS for the bucket:
```bash
# Save this as cors.json
[
  {
    "origin": ["http://localhost:3000", "https://your-domain.com"],
    "method": ["GET", "PUT", "POST", "HEAD"],
    "responseHeader": ["Content-Type", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS (requires gcloud CLI):
```bash
gsutil cors set cors.json gs://wingman-interview-videos-470419
```

## Step 3: Create Service Account

1. Go to [IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click "Create Service Account"
3. **Name**: `wingman-interview-sa`
4. **Description**: Service account for Wingman interview platform
5. Click "Create and Continue"

### Grant Roles:
- Storage Admin
- Speech Administrator  
- Video Intelligence Admin
- Vertex AI User

6. Click "Done"

### Create Key:
1. Click on the created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Download and save as `service-account-key.json` in your project root

## Step 4: Deploy Cloud Functions

### Option A: Using Google Cloud Console

1. Go to [Cloud Functions](https://console.cloud.google.com/functions)
2. Click "Create Function"

**Function 1: generate_upload_url**
- **Name**: `generate_upload_url`
- **Region**: `us-central1`
- **Trigger**: HTTP
- **Authentication**: Allow unauthenticated invocations
- **Runtime**: Python 3.10
- **Source**: Upload from `cloud-function/` directory
- **Entry Point**: `generate_upload_url`
- **Environment Variables**: `BUCKET_NAME=wingman-interview-videos-470419`
- **Service Account**: `wingman-interview-sa@wingman-interview-470419.iam.gserviceaccount.com`

**Function 2: analyze_interview_response**
- **Name**: `analyze_interview_response`
- **Region**: `us-central1`
- **Trigger**: HTTP
- **Authentication**: Allow unauthenticated invocations
- **Runtime**: Python 3.10
- **Source**: Upload from `cloud-function-analysis/` directory
- **Entry Point**: `analyze_interview_response`
- **Timeout**: 540 seconds
- **Memory**: 2 GiB
- **Environment Variables**: `APP_FEEDBACK_ENDPOINT=http://localhost:3000`
- **Service Account**: `wingman-interview-sa@wingman-interview-470419.iam.gserviceaccount.com`

### Option B: Using gcloud CLI (after installation completes)

```bash
# Run the deploy script
./deploy-functions.sh
```

## Step 5: Update Environment Variables

Add to your `.env.local`:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID="wingman-interview-470419"
GOOGLE_CLOUD_BUCKET_NAME="wingman-interview-videos-470419"
GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"

# Cloud Function Endpoints (get these from Cloud Functions console)
GENERATE_UPLOAD_URL_ENDPOINT="https://us-central1-wingman-interview-470419.cloudfunctions.net/generate_upload_url"
APP_FEEDBACK_ENDPOINT="http://localhost:3000"
```

## Step 6: Test Setup

1. Start your Next.js app: `npm run dev`
2. Go to AI Practice page
3. Start an interview session
4. Try recording and uploading a video
5. Check Google Cloud Storage for the uploaded file

## Troubleshooting

- **Function URLs**: Get them from Cloud Functions console > Function details
- **Permissions**: Ensure service account has all required roles
- **CORS**: Must be configured on the storage bucket
- **Billing**: Ensure billing is enabled on your project

## Security Notes

- Never commit `service-account-key.json` to version control
- Add it to `.gitignore`
- Use environment variables for all sensitive data
- Consider using Workload Identity for production
