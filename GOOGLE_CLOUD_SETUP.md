# Google Cloud Setup Guide for Wingman Interview Platform

This guide will help you set up the complete Google Cloud backend for video upload and AI analysis.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud CLI** installed and authenticated
3. **Node.js** and **npm** installed locally

## Step 1: Provide Required Information

Before running the setup scripts, please provide:

1. **Google Cloud Project ID**: 
   - Use existing project or create new one at https://console.cloud.google.com
   - Example: `wingman-interview-platform-2024`

2. **Preferred Region**: 
   - Choose closest to your users
   - Examples: `us-central1`, `us-east1`, `europe-west1`

3. **Unique Bucket Name**: 
   - Must be globally unique across all Google Cloud
   - Example: `wingman-interview-videos-yourname-2024`

4. **Your App Domain**:
   - For local development: Use ngrok tunnel URL
   - For production: Your deployed app URL
   - Example: `https://abc123.ngrok.io` or `https://wingman.yourcompany.com`

## Step 2: Update Configuration Files

1. **Edit `setup-gcloud.sh`**:
   ```bash
   PROJECT_ID="your-actual-project-id"
   REGION="your-preferred-region"
   BUCKET_NAME="your-unique-bucket-name"
   ```

2. **Edit `deploy-functions.sh`**:
   ```bash
   PROJECT_ID="your-actual-project-id"
   REGION="your-preferred-region"
   BUCKET_NAME="your-unique-bucket-name"
   APP_URL="https://your-app-domain.com"
   ```

## Step 3: Run Setup Scripts

1. **Authenticate with Google Cloud**:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Run the setup script**:
   ```bash
   ./setup-gcloud.sh
   ```
   This will:
   - Enable required APIs
   - Create storage bucket with CORS
   - Create service account with permissions
   - Generate service account key

3. **Deploy Cloud Functions**:
   ```bash
   ./deploy-functions.sh
   ```
   This will:
   - Deploy signed URL generation function
   - Deploy video analysis function
   - Return function URLs for your .env file

## Step 4: Update Environment Variables

Add these to your `.env.local` file:

```bash
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT_ID="your-project-id"
GOOGLE_CLOUD_BUCKET_NAME="your-bucket-name"
GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"

# Cloud Function Endpoints (from deploy script output)
GENERATE_UPLOAD_URL_ENDPOINT="https://your-region-your-project.cloudfunctions.net/generate_upload_url"
APP_FEEDBACK_ENDPOINT="https://your-app-domain.com"
```

## Step 5: Set Up Storage Trigger (Optional)

For automatic video analysis when videos are uploaded:

```bash
gcloud eventarc triggers create video-analysis-trigger \
    --location=$REGION \
    --destination-run-service=analyze_interview_response \
    --destination-run-region=$REGION \
    --event-filters="type=google.cloud.storage.object.v1.finalized" \
    --event-filters="bucket=$BUCKET_NAME" \
    --service-account=wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com
```

## Step 6: Test the Setup

1. **Start your Next.js app**:
   ```bash
   npm run dev
   ```

2. **Test video upload**:
   - Go to AI Practice page
   - Start an interview session
   - Record a short video
   - Check if upload succeeds

3. **Verify in Google Cloud Console**:
   - Check Storage bucket for uploaded video
   - Check Cloud Functions logs for any errors

## Troubleshooting

### Common Issues:

1. **"Upload service not configured"**:
   - Check `GENERATE_UPLOAD_URL_ENDPOINT` in .env.local
   - Verify Cloud Function is deployed and accessible

2. **"Insufficient permissions"**:
   - Verify service account has correct roles
   - Check `GOOGLE_APPLICATION_CREDENTIALS` path

3. **CORS errors**:
   - Ensure `cors.json` is applied to bucket
   - Check bucket permissions

4. **Function timeout**:
   - Video analysis function has 9-minute timeout
   - Large videos may need optimization

### Useful Commands:

```bash
# Check function logs
gcloud functions logs read generate_upload_url --region=$REGION

# Test bucket access
gsutil ls gs://your-bucket-name

# Verify service account
gcloud iam service-accounts list
```

## Security Notes

- Keep `service-account-key.json` secure and never commit to git
- Use least-privilege permissions for service accounts
- Consider using Workload Identity for production deployments
- Regularly rotate service account keys

## Cost Optimization

- Set lifecycle policies on storage bucket to delete old videos
- Monitor API usage in Google Cloud Console
- Consider using cheaper storage classes for long-term retention

## Next Steps

After setup is complete:
1. Test end-to-end video upload and processing
2. Configure monitoring and alerting
3. Set up CI/CD for function deployments
4. Implement additional security measures for production
