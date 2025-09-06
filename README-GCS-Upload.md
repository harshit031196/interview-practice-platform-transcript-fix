# Google Cloud Storage Video Upload with V4 Signed URLs

This implementation provides a secure way to upload video files from a web browser directly to Google Cloud Storage using V4 signed URLs.

## Architecture Overview

1. **Frontend**: HTML/JavaScript client that handles file selection and orchestrates the upload
2. **Backend**: Google Cloud Function that generates secure, time-limited upload URLs
3. **Storage**: Google Cloud Storage bucket for storing uploaded videos

## Setup Instructions

### 1. Google Cloud Setup

#### Create a GCS Bucket
```bash
# Create a new bucket (replace with your bucket name)
gsutil mb gs://your-video-upload-bucket

# Enable CORS on the bucket
gsutil cors set cloud-function/cors.json gs://your-video-upload-bucket
```

#### Set up Authentication
```bash
# Create a service account
gcloud iam service-accounts create gcs-uploader \
    --display-name="GCS Video Uploader"

# Grant Storage Admin role to the service account
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:gcs-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Create and download service account key
gcloud iam service-accounts keys create key.json \
    --iam-account=gcs-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 2. Deploy the Cloud Function

#### Update Configuration
1. Edit `cloud-function/main.py`:
   - Replace `BUCKET_NAME = "your-gcs-bucket-name"` with your actual bucket name

#### Deploy the Function
```bash
cd cloud-function

# Deploy the function
gcloud functions deploy generate_upload_url \
    --runtime python310 \
    --trigger-http \
    --allow-unauthenticated \
    --service-account=gcs-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=key.json

# Get the function URL
gcloud functions describe generate_upload_url --format="value(httpsTrigger.url)"
```

### 3. Configure the Frontend

1. Edit `frontend/script.js`:
   - Replace `CLOUD_FUNCTION_URL` with your deployed function URL

2. Serve the frontend:
```bash
cd frontend
python -m http.server 8000
# Or use any web server of your choice
```

## Security Considerations

### Production Deployment

1. **CORS Configuration**: Update CORS settings to allow only your domain:
   ```python
   # In main.py, replace:
   'Access-Control-Allow-Origin': '*'
   # With:
   'Access-Control-Allow-Origin': 'https://yourdomain.com'
   ```

2. **Authentication**: Add authentication to the Cloud Function:
   ```bash
   # Remove --allow-unauthenticated and implement proper auth
   gcloud functions deploy generate_upload_url \
       --runtime python310 \
       --trigger-http \
       --service-account=gcs-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

3. **File Size Limits**: Configure appropriate limits in your Cloud Function and GCS bucket.

## How It Works

### Two-Step Upload Process

1. **Get Signed URL**:
   - Frontend sends file metadata to Cloud Function
   - Cloud Function generates a V4 signed URL with 15-minute expiration
   - URL is returned to frontend

2. **Direct Upload**:
   - Frontend uses signed URL to upload file directly to GCS
   - No file data passes through the Cloud Function
   - Upload is secure and time-limited

### Key Features

- **Secure**: Uses V4 signed URLs with content-type validation
- **Direct Upload**: Files go directly to GCS, not through your servers
- **Time-Limited**: URLs expire in 15 minutes
- **Video-Only**: Validates that only video files are uploaded
- **Progress Tracking**: Visual feedback during upload process
- **Error Handling**: Comprehensive error handling and user feedback

## File Structure

```
├── cloud-function/
│   ├── main.py              # Cloud Function code
│   ├── requirements.txt     # Python dependencies
│   └── cors.json           # CORS configuration for GCS bucket
├── frontend/
│   ├── index.html          # Upload interface
│   └── script.js           # Client-side upload logic
└── README-GCS-Upload.md    # This documentation
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure CORS is configured on both the Cloud Function and GCS bucket
2. **Authentication Errors**: Verify service account has proper permissions
3. **File Size Limits**: Check Cloud Function timeout and memory limits
4. **Network Issues**: Implement retry logic for production use

### Testing

1. Open `frontend/index.html` in a web browser
2. Select a video file
3. Click "Upload Video"
4. Monitor the progress and check for success/error messages

## Cost Optimization

- Signed URLs don't incur additional costs
- Direct uploads reduce Cloud Function execution time
- Consider implementing client-side file compression for large videos
