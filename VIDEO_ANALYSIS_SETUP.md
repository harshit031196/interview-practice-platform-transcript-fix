# Video and Audio Analysis Setup Guide

This guide explains how to set up and use the comprehensive video and audio analysis system for the Wingman interview practice platform.

## 🎯 Overview

The system provides real-time analysis of interview recordings using multiple Google Cloud APIs:

### Speech and Voice Analysis 🗣️
- **Service**: Google Cloud Speech-to-Text API
- **Features**:
  - High-accuracy transcription
  - Filler word detection ("um", "ah", "like", etc.)
  - Speaking pace analysis (words per minute)
  - Clarity scoring based on pacing and filler words
  - Timestamp-based word tracking

### Facial Expression Analysis 😊
- **Service**: Google Cloud Vision AI API
- **Features**:
  - Real-time emotion detection (joy, sorrow, anger, surprise)
  - Emotion tracking over time
  - Detection confidence scoring
  - Frame-by-frame analysis at 1-second intervals

### Confidence Analysis 💪
- **Service**: Google Cloud Vision AI API (Face Detection)
- **Features**:
  - Eye contact estimation using head pose angles
  - Head stability measurement
  - Consistency scoring
  - Overall confidence metrics

## 🚀 Setup Instructions

### 1. Enable Google Cloud APIs

Enable the following APIs in your Google Cloud Console:

```bash
gcloud services enable speech.googleapis.com
gcloud services enable vision.googleapis.com
gcloud services enable videointelligence.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
```

### 2. Deploy the Analysis Cloud Function

```bash
# Make the deployment script executable
chmod +x deploy-video-analysis.sh

# Deploy the function
./deploy-video-analysis.sh
```

### 3. Environment Configuration

Add to your `.env.local` file:

```env
# Video Analysis Function URL (automatically set by deployment script)
VIDEO_ANALYSIS_FUNCTION_URL=https://your-region-your-project.cloudfunctions.net/analyze-video

# Google Cloud Storage bucket for videos
BUCKET_NAME=wingman-interview-videos

# Upload function endpoint
GENERATE_UPLOAD_URL_ENDPOINT=https://your-region-your-project.cloudfunctions.net/generate_upload_url
```

### 4. Create Storage Bucket

```bash
# Create the bucket for video storage
gsutil mb gs://wingman-interview-videos

# Set CORS policy for the bucket
gsutil cors set cloud-function/cors.json gs://wingman-interview-videos
```

## 📊 Analysis Features

### Speech Analysis Metrics
- **Transcription**: Full text of the interview response
- **Word Count**: Total words spoken
- **Speaking Pace**: Words per minute with consistency tracking
- **Filler Words**: Count and percentage of filler words with timestamps
- **Clarity Score**: Overall speech clarity rating (0-100%)

### Facial Expression Metrics
- **Emotion Timeline**: Frame-by-frame emotion detection
- **Emotion Statistics**: Average, min, max, and standard deviation for each emotion
- **Detection Quality**: Frame analysis count and confidence scores

### Confidence Metrics
- **Eye Contact Score**: Estimated eye contact percentage based on head pose
- **Consistency**: How consistent the eye contact is throughout
- **Head Stability**: Measurement of head movement stability
- **Overall Confidence**: Weighted combination of all confidence factors

## 🎨 Frontend Integration

### Video Analysis Page
- **URL**: `/practice/ai/analysis`
- **Features**:
  - Drag-and-drop video upload
  - Real-time progress tracking
  - Comprehensive results display
  - Downloadable analysis reports

### Analysis Results Component
- **Component**: `VideoAnalysisResults`
- **Features**:
  - Tabbed interface for different analysis types
  - Interactive charts and visualizations
  - Score breakdowns with color-coded ratings
  - Detailed metrics and recommendations

## 🔧 API Endpoints

### POST `/api/video-analysis`
Starts comprehensive video analysis.

**Request Body**:
```json
{
  "videoUri": "gs://bucket-name/video-file.webm"
}
```

**Response**:
```json
{
  "speech_analysis": { ... },
  "facial_analysis": { ... },
  "confidence_analysis": { ... },
  "overall_score": {
    "overall_score": 0.85,
    "grade": "A-",
    "component_scores": { ... }
  }
}
```

### POST `/api/upload/signed-url`
Generates signed URLs for secure video uploads.

## 📈 Scoring System

### Overall Grade Scale
- **A+ (90-100%)**: Exceptional performance
- **A (85-89%)**: Excellent performance
- **A- (80-84%)**: Very good performance
- **B+ (75-79%)**: Good performance
- **B (70-74%)**: Above average performance
- **B- (65-69%)**: Average performance
- **C+ (60-64%)**: Below average performance
- **C (55-59%)**: Poor performance
- **C- (50-54%)**: Very poor performance
- **D+ (45-49%)**: Failing performance
- **D (40-44%)**: Very poor performance
- **F (0-39%)**: Unacceptable performance

### Component Scoring
- **Speech Clarity (60% weight)**: Based on pacing and filler words
- **Positivity (20% weight)**: Average joy emotion score
- **Confidence (20% weight)**: Eye contact, consistency, and stability

## 🛠️ Technical Architecture

### Cloud Function Structure
```
cloud-function-video-analysis/
├── main.py                 # Main analysis service
├── requirements.txt        # Python dependencies
└── README.md              # Function documentation
```

### Key Dependencies
- `google-cloud-speech`: Speech-to-Text API
- `google-cloud-vision`: Vision AI API
- `google-cloud-videointelligence`: Video Intelligence API
- `opencv-python`: Video frame extraction
- `numpy`: Numerical computations

### Analysis Pipeline
1. **Video Upload**: Secure upload to Google Cloud Storage
2. **Parallel Processing**: Speech, facial, and confidence analysis run simultaneously
3. **Frame Extraction**: Extract frames at 1-second intervals for visual analysis
4. **Speech Processing**: Convert audio to text with timestamps
5. **Facial Analysis**: Detect emotions in each frame
6. **Confidence Calculation**: Analyze head pose and eye contact
7. **Score Aggregation**: Combine all metrics into overall performance score

## 🔒 Security & Privacy

- All video uploads use signed URLs for secure transfer
- Videos are stored in private Google Cloud Storage buckets
- Analysis results can be downloaded and deleted after viewing
- User authentication required for all analysis operations

## 📱 Usage Examples

### Basic Analysis Flow
1. User uploads interview video
2. System extracts audio and video frames
3. Parallel analysis of speech, facial expressions, and confidence
4. Results displayed in comprehensive dashboard
5. User can download detailed report

### Integration with Interview Practice
- Automatic analysis after AI interview sessions
- Historical performance tracking
- Improvement recommendations based on analysis
- Comparison with previous sessions

## 🐛 Troubleshooting

### Common Issues
1. **Upload Failures**: Check CORS configuration and bucket permissions
2. **Analysis Timeouts**: Increase Cloud Function timeout for large videos
3. **Low Detection Confidence**: Ensure good lighting and clear video quality
4. **Missing Dependencies**: Verify all Google Cloud APIs are enabled

### Performance Optimization
- Use compressed video formats (WebM recommended)
- Limit video duration to 5-10 minutes for faster processing
- Ensure stable internet connection for uploads
- Use appropriate video resolution (720p recommended)

## 📞 Support

For technical support or questions about the video analysis system, please refer to the main project documentation or create an issue in the project repository.
