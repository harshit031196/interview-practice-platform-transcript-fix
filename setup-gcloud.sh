#!/bin/bash

# Google Cloud Setup Script for Wingman Interview Platform
# Run this script after providing your project details

echo "🚀 Setting up Google Cloud services for Wingman Interview Platform..."

# Variables to be filled in
PROJECT_ID="wingman-interview-470419"
REGION="us-central1"          # Replace with your preferred region if needed
BUCKET_NAME="wingman-interview-videos-470419"  # Unique bucket name

echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Bucket Name: $BUCKET_NAME"

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📡 Enabling required APIs..."
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable speech.googleapis.com
gcloud services enable videointelligence.googleapis.com
gcloud services enable aiplatform.googleapis.com

# Create storage bucket
echo "🪣 Creating storage bucket..."
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME

# Set bucket CORS configuration
echo "🔧 Setting up CORS configuration..."
gsutil cors set cloud-function/cors.json gs://$BUCKET_NAME

# Create service account
echo "👤 Creating service account..."
gcloud iam service-accounts create wingman-interview-sa \
    --display-name="Wingman Interview Service Account" \
    --description="Service account for Wingman interview platform"

# Grant necessary permissions
echo "🔐 Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/speech.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/videointelligence.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Create and download service account key
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create ./service-account-key.json \
    --iam-account=wingman-interview-sa@$PROJECT_ID.iam.gserviceaccount.com

echo "✅ Google Cloud setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update your .env.local file with the generated credentials"
echo "2. Deploy the Cloud Functions"
echo "3. Test the video upload and processing workflow"
echo ""
echo "🔒 Important: Keep your service-account-key.json file secure!"
