# Interview Video Analysis Cloud Function

This Google Cloud Function processes uploaded interview videos to generate comprehensive feedback using multiple Google Cloud AI APIs.

## Function Overview

**Function Name:** `analyze_interview_response`  
**Trigger:** Google Cloud Storage (file creation)  
**Runtime:** Python 3.10

## AI Services Integration

### 1. Speech-to-Text API
- Extracts transcript with word timestamps
- Calculates speaking pace (WPM)
- Counts filler words ("um", "ah", "like", etc.)
- Enables automatic punctuation

### 2. Video Intelligence API
- Performs face detection and emotion analysis
- Creates emotion timeline with timestamps
- Detects joy, sorrow, anger, surprise expressions

### 3. Vertex AI (Gemini 1.5 Flash)
- Analyzes content structure and clarity
- Provides FAANG interview coaching feedback
- Returns structured JSON with actionable insights

## Output Format

```json
{
  "transcript": "Full interview transcript...",
  "analysis_metrics": {
    "speaking_pace_wpm": 145,
    "filler_word_count": 4,
    "clarity_score": 8.5
  },
  "emotion_timeline": [
    {"timestamp": "0.5s", "emotion": "neutral", "confidence": 0.8},
    {"timestamp": "2.1s", "emotion": "joy", "confidence": 0.9}
  ],
  "content_feedback": {
    "summary": "Well-structured answer with clear examples...",
    "actionable_feedback": [
      "Reduce filler words for better clarity",
      "Add more quantifiable results",
      "Practice smoother transitions between points"
    ]
  },
  "processing_metadata": {
    "processed_at": "2024-01-15T10:30:00Z",
    "file_name": "interview_response.mp4",
    "bucket_name": "interview-videos"
  }
}
```

## Deployment Instructions

### Prerequisites

1. **Enable Required APIs:**
```bash
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable speech.googleapis.com
gcloud services enable videointelligence.googleapis.com
gcloud services enable aiplatform.googleapis.com
gcloud services enable storage.googleapis.com
```

2. **Create Service Account:**
```bash
gcloud iam service-accounts create interview-analyzer \
    --display-name="Interview Video Analyzer"

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:interview-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:interview-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/speech.editor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:interview-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/videointelligence.editor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:interview-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"
```

3. **Install FFmpeg in Cloud Function:**
The function requires FFmpeg for audio extraction. Create a custom build with FFmpeg included.

### Deploy Function

```bash
cd cloud-function-analysis

# Deploy with GCS trigger
gcloud functions deploy analyze_interview_response \
    --runtime python310 \
    --trigger-event google.storage.object.finalize \
    --trigger-resource YOUR_BUCKET_NAME \
    --service-account interview-analyzer@YOUR_PROJECT_ID.iam.gserviceaccount.com \
    --memory 2GB \
    --timeout 540s \
    --set-env-vars VERTEX_AI_LOCATION=us-central1
```

### Environment Variables

- `GOOGLE_CLOUD_PROJECT`: Automatically set by Cloud Functions
- `VERTEX_AI_LOCATION`: Set to your preferred Vertex AI region (default: us-central1)

## Processing Pipeline

1. **File Download**: Downloads video from triggering GCS bucket
2. **Audio Extraction**: Uses FFmpeg to extract FLAC audio (16kHz, mono)
3. **Speech Processing**: Transcribes audio with word timestamps
4. **Video Analysis**: Detects facial emotions throughout video
5. **Content Analysis**: Analyzes transcript with Gemini for feedback
6. **Result Aggregation**: Combines all analyses into structured output
7. **Cleanup**: Removes temporary files

## Error Handling

- Comprehensive try-catch blocks for each processing step
- Fallback responses for AI service failures
- Automatic cleanup of temporary files
- Detailed logging for debugging

## Performance Considerations

- **Memory**: 2GB recommended for video processing
- **Timeout**: 540s (9 minutes) for complete analysis
- **Concurrent Executions**: Consider rate limits for AI APIs
- **Cost Optimization**: Uses efficient audio formats and model selections

## Monitoring

Monitor function execution through:
- Cloud Functions logs
- Cloud Monitoring metrics
- Error reporting for failed analyses

## Supported Video Formats

- MP4, MOV, AVI, MKV (common video formats)
- Audio extraction supports most video codecs
- Optimal: MP4 with AAC audio encoding

## Limitations

- Maximum video length: ~10 minutes (due to timeout constraints)
- File size limit: 2GB (Cloud Function storage limit)
- Processing time: 2-8 minutes depending on video length
- Language support: Currently optimized for English interviews
