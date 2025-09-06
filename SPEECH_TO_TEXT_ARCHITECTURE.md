# Speech-to-Text Architecture Documentation

This document describes the speech-to-text architecture implemented for the interview platform, covering both real-time streaming transcription and offline post-interview analysis.

## Overview

The system consists of two main components:

1. **Real-time Speech Streaming**: Uses Google Cloud Speech-to-Text v2 StreamingRecognize API to provide low-latency transcription during interviews
2. **Offline Speech Analysis**: Uses Google Cloud Speech-to-Text v1p1beta1 LongRunningRecognize API for high-accuracy post-interview analysis

## Database Schema

The system uses the following Prisma models:

```prisma
// Speech analysis job status enum
enum SpeechAnalysisStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}

// Speech analysis job model
model SpeechAnalysisJob {
  id            String              @id @default(cuid())
  userId        String
  interviewId   String
  status        SpeechAnalysisStatus
  filename      String
  fileSize      Int
  operationName String?
  transcript    String?
  confidence    Float?
  errorMessage  String?
  startTime     DateTime            @default(now())
  completionTime DateTime?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Real-time Speech Streaming

### Frontend Component (`SpeechStreamingService`)

- Manages audio recording and chunk transmission
- Uses MediaRecorder API to capture audio
- Sends chunks in real-time to the streaming API
- Handles network failures with fallback mechanism
- Maintains transcription history for UI display
- Implements retry logic for API timeout errors
- Preserves transcript data during stream reconnections

### Backend API (`/api/ai/speech-stream-v2/route.ts`)

- Authenticates users via NextAuth, JWT, or database session
- Streams audio chunks to Google Cloud Speech-to-Text v2
- Uses proper gRPC streaming for each utterance
- Returns interim and final results as they become available
- Handles errors with appropriate logging and responses
- Implements timeout management for gRPC connections
- Auto-reconnects streaming sessions after DEADLINE_EXCEEDED errors

## Offline Speech Analysis

### Frontend Integration

- To be implemented: UI for initiating offline analysis of interview recordings
- To be implemented: Component for viewing analysis results including transcript confidence and word timings

### Backend API (`/api/ai/speech-analysis/route.ts`)

#### POST Handler

- Authenticates user via multiple methods
- Accepts audio file uploads and interview metadata
- Uploads audio to Google Cloud Storage
- Creates database record with `QUEUED` status
- Starts long-running recognition operation
- Updates job status to `PROCESSING`
- Returns operation info and estimated completion time

#### GET Handler

- Accepts `operationName` or `jobId` to check status
- Queries Google Cloud Speech operation status
- If complete:
  - Fetches transcript results
  - Calculates average confidence
  - Extracts word timings
  - Updates database with `COMPLETED` status and results
- If error:
  - Updates database with `FAILED` status and error message
- Returns appropriate status information to client

## Environment Configuration

Required environment variables:
- `GOOGLE_CLOUD_PROJECT_ID`: Google Cloud project ID
- `GCS_BUCKET_NAME`: Google Cloud Storage bucket for audio uploads
- `NEXTAUTH_SECRET`: Secret for JWT authentication

## Authentication Flow

The system supports multiple authentication methods:
1. JWT token authentication
2. NextAuth session authentication
3. Database session token authentication (fallback)

## Error Handling

- Network failures during streaming are handled with retry logic
- Empty transcripts are detected and reported
- Database errors are logged but don't block processing
- API errors return appropriate HTTP status codes and details
- Long-running operations track errors in the database
- DEADLINE_EXCEEDED errors from Google Cloud Speech API are handled with automatic reconnection

## Future Improvements

- Create frontend UI for accessing offline analysis results
- Improve error reporting and user feedback
- Add support for multiple languages
- Implement speaker diarization for multi-person interviews
- Implement metrics collection for speech recognition reliability

## Timeout and Error Handling

### DEADLINE_EXCEEDED and HTTP 408 Request Timeout Error Fix

The system includes specific handling for the DEADLINE_EXCEEDED error (error code 4) and HTTP 408 Request Timeout errors that can occur in long-running gRPC streaming connections to the Google Cloud Speech API.

#### Backend Implementation

- **SpeechClient Configuration**: The Speech-to-Text client is initialized with these optimized parameters:
  - 60-second timeout instead of the default (which can be over 5000 seconds)
  - Configurable keepalive settings (10 seconds keepalive time, 5 seconds keepalive timeout)
  - Enhanced retry configuration with appropriate backoff strategy
  - HTTP/2 stream handling optimizations for more stable connections

- **Stream Recovery**: When a DEADLINE_EXCEEDED or timeout error occurs, the system:
  1. Preserves any existing transcript data
  2. Flags the stream for reconnection
  3. Creates a new streaming connection when the next audio chunk arrives
  4. Limits reconnection attempts to prevent infinite retry loops
  5. Applies exponential backoff between retry attempts

#### Frontend Implementation

- **Retry Logic**: Implements exponential backoff for retrying failed requests (1s, 2s, 4s...)
- **Error Detection**: Specifically handles both DEADLINE_EXCEEDED and HTTP 408 Request Timeout errors with special recovery logic
- **Chunking Optimization**: Uses 1.5-second audio chunks for optimal balance between latency and reliability
- **Transcript Preservation**: Maintains interim transcripts in session storage as a fallback mechanism
- **Connection Monitoring**: Tracks and reports stream health metrics including timeout counts
- **AbortController Integration**: Uses fetch AbortSignal with appropriate timeouts to prevent stuck requests

#### Configuration Parameters

The system now uses environment variables for fine-tuning timeout behavior:

```ini
SPEECH_TO_TEXT_CLIENT_TIMEOUT="60000"
SPEECH_TO_TEXT_CHUNK_INTERVAL_MS="1500"
SPEECH_TO_TEXT_MAX_RETRIES="3"
SPEECH_TO_TEXT_RETRY_DELAY_MS="1000"
SPEECH_TO_TEXT_KEEPALIVE_TIME_MS="10000"
SPEECH_TO_TEXT_KEEPALIVE_TIMEOUT_MS="5000"
SPEECH_TO_TEXT_DEBUG_MODE="true"
```

This approach ensures that streaming sessions remain stable even during long interviews, and transcription quality is maintained despite temporary connection issues.
