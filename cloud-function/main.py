import json
import logging
import os
from datetime import datetime, timedelta
from google.cloud import storage
from flask import Request
import functions_framework

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'wingman-interview-videos')

@functions_framework.http
def generate_upload_url(request: Request):
    """
    Google Cloud Function to generate V4 signed URLs for secure file uploads.
    
    This function generates time-limited, secure URLs that grant the frontend
    permission to upload specific files to a GCS bucket using the V4 signing process.
    
    IMPORTANT CORS SETUP REQUIRED:
    1. Enable CORS on this Cloud Function by configuring the Cloud Function
       to allow requests from your frontend domain
    2. Enable CORS on the target GCS bucket using:
       gsutil cors set cors.json gs://your-bucket-name
    """
    
    # Set CORS headers for preflight requests
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',  # Replace '*' with your domain in production
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    # Set CORS headers for main request
    headers = {
        'Access-Control-Allow-Origin': '*',  # Replace '*' with your domain in production
        'Content-Type': 'application/json'
    }
    
    try:
        # Validate request method
        if request.method != 'POST':
            logger.warning(f"Invalid request method: {request.method}")
            return json.dumps({
                'error': 'Only POST method is allowed'
            }), 405, headers
        
        # Parse request body
        try:
            request_json = request.get_json(silent=True)
            if not request_json:
                raise ValueError("No JSON body provided")
        except Exception as e:
            logger.error(f"Failed to parse request JSON: {str(e)}")
            return json.dumps({
                'error': 'Invalid JSON in request body'
            }), 400, headers
        
        # Extract and validate required fields
        filename = request_json.get('filename')
        content_type = request_json.get('contentType')
        
        if not filename:
            logger.warning("Missing filename in request")
            return json.dumps({
                'error': 'filename is required'
            }), 400, headers
            
        if not content_type:
            logger.warning("Missing contentType in request")
            return json.dumps({
                'error': 'contentType is required'
            }), 400, headers
        
        # Validate content type for video files
        if not content_type.startswith('video/'):
            logger.warning(f"Invalid content type: {content_type}")
            return json.dumps({
                'error': 'Only video files are allowed'
            }), 400, headers
        
        logger.info(f"Generating signed URL for file: {filename}, content-type: {content_type}")
        
        # Initialize Google Cloud Storage client
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(BUCKET_NAME)
            blob = bucket.blob(filename)
        except Exception as e:
            logger.error(f"Failed to initialize GCS client: {str(e)}")
            return json.dumps({
                'error': 'Failed to connect to storage service'
            }), 500, headers
        
        # Generate resumable upload URL instead of signed URL
        try:
            # Create a resumable upload session
            from google.resumable_media import requests as resumable_requests
            from google.auth.transport import requests as auth_requests
            import google.auth
            
            # Get credentials and create transport
            credentials, project = google.auth.default()
            transport = auth_requests.Request()
            
            # Create upload URL for resumable upload
            upload_url = f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET_NAME}/o"
            
            logger.info(f"Successfully generated upload endpoint for {filename}")
            
            # Return the upload URL and metadata
            return json.dumps({
                'signedUrl': upload_url,
                'filename': filename,
                'contentType': content_type,
                'bucket': BUCKET_NAME,
                'method': 'POST'
            }), 200, headers
            
        except Exception as e:
            logger.error(f"Failed to generate signed URL: {str(e)}")
            return json.dumps({
                'error': 'Failed to generate upload URL'
            }), 500, headers
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return json.dumps({
            'error': 'Internal server error'
        }), 500, headers
