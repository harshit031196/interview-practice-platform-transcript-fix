#!/bin/bash

# Deploy Video Analysis Cloud Function
# This script deploys the video analysis function to Google Cloud Functions

set -e

echo "🚀 Deploying Video Analysis Cloud Function..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Set variables
FUNCTION_NAME="analyze-video"
REGION="asia-south1"
RUNTIME="python311"
ENTRY_POINT="analyze_video"
MEMORY="2GB"
TIMEOUT="540s"
SOURCE_DIR="cloud-function-video-analysis"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory $SOURCE_DIR not found"
    exit 1
fi

# Deploy the function
echo "📦 Deploying function from $SOURCE_DIR..."

gcloud functions deploy $FUNCTION_NAME \
    --gen2 \
    --runtime=$RUNTIME \
    --region=$REGION \
    --source=$SOURCE_DIR \
    --entry-point=$ENTRY_POINT \
    --memory=$MEMORY \
    --timeout=$TIMEOUT \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="BUCKET_NAME=wingman-interview-videos-asia" \
    --max-instances=10

echo "✅ Function deployed successfully!"

# Get the function URL
FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format="value(serviceConfig.uri)")
echo "🔗 Function URL: $FUNCTION_URL"

# Update .env.local with the function URL
if [ -f ".env.local" ]; then
    if grep -q "VIDEO_ANALYSIS_FUNCTION_URL" .env.local; then
        sed -i.bak "s|VIDEO_ANALYSIS_FUNCTION_URL=.*|VIDEO_ANALYSIS_FUNCTION_URL=$FUNCTION_URL|" .env.local
    else
        echo "VIDEO_ANALYSIS_FUNCTION_URL=$FUNCTION_URL" >> .env.local
    fi
    echo "📝 Updated .env.local with function URL"
fi

echo "🎉 Video Analysis Cloud Function deployment complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your Google Cloud Storage bucket 'wingman-interview-videos' exists"
echo "2. Enable the following APIs in your Google Cloud project:"
echo "   - Cloud Speech-to-Text API"
echo "   - Cloud Vision API" 
echo "   - Video Intelligence API"
echo "3. Test the function with a sample video"
