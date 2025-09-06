#!/bin/bash

# Deploy Cloud Functions for Wingman Interview Platform
# Make sure to run setup-gcloud.sh first and update the variables below

# Variables - UPDATE THESE WITH YOUR ACTUAL VALUES
PROJECT_ID="wingman-interview-470419"
REGION="us-central1"
BUCKET_NAME="wingman-interview-videos-470419"
APP_URL="http://localhost:3000"  # Your deployed app URL or ngrok for local testing

echo "🚀 Deploying Cloud Functions..."

# Deploy signed URL generation function
echo "📤 Deploying generate_upload_url function..."
cd cloud-function
gcloud functions deploy generate_upload_url \
    --gen2 \
    --runtime=python310 \
    --region=$REGION \
    --source=. \
    --entry-point=generate_upload_url \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="BUCKET_NAME=$BUCKET_NAME" \
    --service-account=wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com

# Get the function URL
UPLOAD_URL=$(gcloud functions describe generate_upload_url --region=$REGION --format="value(serviceConfig.uri)")
echo "✅ Upload function deployed at: $UPLOAD_URL"

cd ..

# Deploy video analysis function
echo "🎥 Deploying analyze_interview_response function..."
cd cloud-function-analysis
gcloud functions deploy analyze_interview_response \
    --gen2 \
    --runtime=python310 \
    --region=$REGION \
    --source=. \
    --entry-point=analyze_interview_response \
    --trigger-http \
    --allow-unauthenticated \
    --timeout=540s \
    --memory=2Gi \
    --set-env-vars="APP_FEEDBACK_ENDPOINT=$APP_URL/api/interviews" \
    --service-account=wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com

# Get the function URL
ANALYSIS_URL=$(gcloud functions describe analyze_interview_response --region=$REGION --format="value(serviceConfig.uri)")
echo "✅ Analysis function deployed at: $ANALYSIS_URL"

cd ..

echo ""
echo "🎉 Cloud Functions deployed successfully!"
echo ""
echo "📝 Add these to your .env.local file:"
echo "GENERATE_UPLOAD_URL_ENDPOINT=\"$UPLOAD_URL\""
echo "ANALYZE_INTERVIEW_ENDPOINT=\"$ANALYSIS_URL\""
echo "GOOGLE_CLOUD_BUCKET_NAME=\"$BUCKET_NAME\""
echo "GOOGLE_CLOUD_PROJECT_ID=\"$PROJECT_ID\""
echo ""
echo "⚠️  Don't forget to:"
echo "1. Set up Cloud Storage bucket trigger for the analysis function"
echo "2. Update your app's environment variables"
echo "3. Test the complete workflow"
