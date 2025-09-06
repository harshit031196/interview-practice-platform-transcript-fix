import json
import os
import tempfile
import logging
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
import subprocess
import requests
from flask import Request

# Google Cloud imports
from google.cloud import storage
from google.cloud import speech
from google.cloud import videointelligence
import vertexai
from vertexai.generative_models import GenerativeModel
import functions_framework

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'wingman-interview-videos')
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT')
LOCATION = os.environ.get('VERTEX_AI_LOCATION', 'us-central1')
APP_FEEDBACK_ENDPOINT = os.environ.get('APP_FEEDBACK_ENDPOINT')

# Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)

@functions_framework.cloud_event
def analyze_interview_response(cloud_event):
    """
    Google Cloud Function triggered by GCS file uploads to analyze interview videos.
    
    This function processes uploaded interview videos through multiple AI services:
    1. Speech-to-Text for transcript and speaking metrics
    2. Video Intelligence for emotion detection
    3. Gemini for content analysis and feedback
    
    Args:
        cloud_event: CloudEvent containing GCS trigger data
        
    Returns:
        Dict: Comprehensive analysis results in JSON format
    """
    try:
        # Extract event data
        data = cloud_event.data
        bucket_name = data['bucket']
        file_name = data['name']
        
        logger.info(f"Processing video: gs://{bucket_name}/{file_name}")
        
        # Initialize clients
        storage_client = storage.Client()
        speech_client = speech.SpeechClient()
        video_client = videointelligence.VideoIntelligenceServiceClient()
        
        # Create temporary directory for processing
        temp_dir = tempfile.mkdtemp()
        video_path = None
        audio_path = None
        
        try:
            # Step 1: Download video file from GCS
            video_path = download_video_from_gcs(
                storage_client, bucket_name, file_name, temp_dir
            )
            
            # Step 2: Extract audio and process with Speech-to-Text
            audio_path = extract_audio_from_video(video_path, temp_dir)
            transcript_data = process_audio_with_speech_api(
                speech_client, audio_path
            )
            
            # Step 3: Process video with Vision AI for emotion detection
            emotion_timeline = process_video_with_vision_ai(
                video_client, f"gs://{bucket_name}/{file_name}"
            )
            
            # Step 4: Analyze content with Gemini
            content_feedback = analyze_content_with_gemini(
                transcript_data['transcript']
            )
            
            # Step 5: Aggregate results
            analysis_result = {
                "transcript": transcript_data['transcript'],
                "analysis_metrics": {
                    "speaking_pace_wpm": transcript_data['speaking_pace_wpm'],
                    "filler_word_count": transcript_data['filler_word_count'],
                    "clarity_score": calculate_clarity_score(
                        transcript_data['speaking_pace_wpm'],
                        transcript_data['filler_word_count'],
                        len(transcript_data['transcript'].split())
                    )
                },
                "emotion_timeline": emotion_timeline,
                "content_feedback": content_feedback,
                "processing_metadata": {
                    "processed_at": datetime.utcnow().isoformat(),
                    "file_name": file_name,
                    "bucket_name": bucket_name
                }
            }
            
            # Step 6: Send results back to the application
            send_feedback_to_app(analysis_result, file_name)
            
            logger.info("Video analysis completed successfully")
            return analysis_result
            
        finally:
            # Step 6: Cleanup temporary files
            cleanup_temp_files(temp_dir, video_path, audio_path)
            
    except Exception as e:
        logger.error(f"Error processing video: {str(e)}")
        raise


def download_video_from_gcs(storage_client: storage.Client, 
                           bucket_name: str, 
                           file_name: str, 
                           temp_dir: str) -> str:
    """
    Download video file from Google Cloud Storage to local temporary directory.
    
    Args:
        storage_client: Initialized GCS client
        bucket_name: Name of the GCS bucket
        file_name: Name of the file to download
        temp_dir: Temporary directory path
        
    Returns:
        str: Local path to downloaded video file
    """
    try:
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_name)
        
        # Create local file path
        local_video_path = os.path.join(temp_dir, f"video_{os.path.basename(file_name)}")
        
        # Download file
        blob.download_to_filename(local_video_path)
        logger.info(f"Downloaded video to: {local_video_path}")
        
        return local_video_path
        
    except Exception as e:
        logger.error(f"Failed to download video from GCS: {str(e)}")
        raise


def extract_audio_from_video(video_path: str, temp_dir: str) -> str:
    """
    Extract audio from video file using FFmpeg and convert to FLAC format.
    
    Args:
        video_path: Path to the input video file
        temp_dir: Temporary directory for output
        
    Returns:
        str: Path to extracted audio file in FLAC format
    """
    try:
        audio_path = os.path.join(temp_dir, "extracted_audio.flac")
        
        # Use FFmpeg to extract audio and convert to FLAC
        # FLAC provides lossless compression and is supported by Speech-to-Text
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vn',  # No video
            '-acodec', 'flac',  # FLAC codec
            '-ar', '16000',  # 16kHz sample rate (optimal for speech)
            '-ac', '1',  # Mono channel
            '-y',  # Overwrite output file
            audio_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logger.info(f"Audio extracted successfully to: {audio_path}")
        
        return audio_path
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg failed: {e.stderr}")
        raise Exception(f"Audio extraction failed: {e.stderr}")
    except Exception as e:
        logger.error(f"Failed to extract audio: {str(e)}")
        raise


def process_audio_with_speech_api(speech_client: speech.SpeechClient, 
                                 audio_path: str) -> Dict[str, Any]:
    """
    Process audio file with Google Cloud Speech-to-Text API.
    
    Args:
        speech_client: Initialized Speech client
        audio_path: Path to audio file
        
    Returns:
        Dict containing transcript, speaking pace, and filler word count
    """
    try:
        # Read audio file
        with open(audio_path, 'rb') as audio_file:
            content = audio_file.read()
        
        # Configure audio settings
        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
            sample_rate_hertz=16000,
            language_code="en-US",
            enable_word_time_offsets=True,  # Enable word timestamps
            enable_automatic_punctuation=True,  # Add punctuation
            model="latest_long",  # Use latest model for longer audio
            use_enhanced=True  # Use enhanced model for better accuracy
        )
        
        # Perform speech recognition
        logger.info("Starting speech-to-text processing...")
        response = speech_client.recognize(config=config, audio=audio)
        
        # Process results
        full_transcript = ""
        all_words = []
        
        for result in response.results:
            full_transcript += result.alternatives[0].transcript + " "
            
            # Collect word timing information
            for word_info in result.alternatives[0].words:
                all_words.append({
                    'word': word_info.word,
                    'start_time': word_info.start_time.total_seconds(),
                    'end_time': word_info.end_time.total_seconds()
                })
        
        # Calculate speaking pace (words per minute)
        if all_words:
            total_duration = all_words[-1]['end_time'] - all_words[0]['start_time']
            speaking_pace_wpm = int((len(all_words) / total_duration) * 60) if total_duration > 0 else 0
        else:
            speaking_pace_wpm = 0
        
        # Count filler words
        filler_words = ['um', 'uh', 'ah', 'like', 'you know', 'so', 'actually', 'basically']
        filler_word_count = count_filler_words(full_transcript.lower(), filler_words)
        
        logger.info(f"Speech processing complete. WPM: {speaking_pace_wpm}, Fillers: {filler_word_count}")
        
        return {
            'transcript': full_transcript.strip(),
            'speaking_pace_wpm': speaking_pace_wpm,
            'filler_word_count': filler_word_count,
            'word_timestamps': all_words
        }
        
    except Exception as e:
        logger.error(f"Speech-to-Text processing failed: {str(e)}")
        raise


def count_filler_words(transcript: str, filler_words: List[str]) -> int:
    """
    Count occurrences of filler words in transcript.
    
    Args:
        transcript: Lowercase transcript text
        filler_words: List of filler words to count
        
    Returns:
        int: Total count of filler words
    """
    count = 0
    for filler in filler_words:
        # Use word boundaries to avoid partial matches
        pattern = r'\b' + re.escape(filler) + r'\b'
        count += len(re.findall(pattern, transcript))
    return count


def process_video_with_vision_ai(video_client: videointelligence.VideoIntelligenceServiceClient,
                                gcs_uri: str) -> List[Dict[str, Any]]:
    """
    Process video with Google Cloud Video Intelligence API for emotion detection.
    
    Args:
        video_client: Initialized Video Intelligence client
        gcs_uri: GCS URI of the video file
        
    Returns:
        List of emotion timeline entries with timestamps
    """
    try:
        logger.info("Starting video emotion analysis...")
        
        # Configure video analysis request
        features = [videointelligence.Feature.FACE_DETECTION]
        
        # Start the analysis operation
        operation = video_client.annotate_video(
            request={
                "features": features,
                "input_uri": gcs_uri,
                "video_context": {
                    "face_detection_config": {
                        "include_bounding_boxes": False,
                        "include_attributes": True
                    }
                }
            }
        )
        
        logger.info("Waiting for video analysis to complete...")
        result = operation.result(timeout=300)  # 5 minute timeout
        
        # Process face detection results
        emotion_timeline = []
        
        for annotation_result in result.annotation_results:
            for face_detection in annotation_result.face_detection_annotations:
                for track in face_detection.tracks:
                    # Process each segment of the face track
                    for segment in track.segment:
                        start_time = segment.start_time_offset.total_seconds()
                        
                        # Get the first frame's attributes for this segment
                        if track.timestamped_objects:
                            first_frame = track.timestamped_objects[0]
                            attributes = first_frame.attributes
                            
                            # Extract dominant emotion
                            dominant_emotion = "neutral"
                            max_confidence = 0.0
                            
                            for attribute in attributes:
                                if attribute.name in ['joy', 'sorrow', 'anger', 'surprise'] and attribute.confidence > max_confidence:
                                    max_confidence = attribute.confidence
                                    if attribute.confidence > 0.5:  # Threshold for emotion detection
                                        dominant_emotion = attribute.name
                            
                            emotion_timeline.append({
                                "timestamp": f"{start_time:.1f}s",
                                "emotion": dominant_emotion,
                                "confidence": round(max_confidence, 2)
                            })
        
        # Sort by timestamp and remove duplicates
        emotion_timeline = sorted(emotion_timeline, key=lambda x: float(x['timestamp'][:-1]))
        
        logger.info(f"Emotion analysis complete. Found {len(emotion_timeline)} emotion points")
        return emotion_timeline
        
    except Exception as e:
        logger.error(f"Video Intelligence processing failed: {str(e)}")
        # Return empty timeline if processing fails
        return [{"timestamp": "0.0s", "emotion": "neutral", "confidence": 0.0}]


def analyze_content_with_gemini(transcript: str) -> Dict[str, Any]:
    """
    Analyze interview content using Gemini 1.5 Flash model via Vertex AI.
    
    Args:
        transcript: Full transcript of the interview response
        
    Returns:
        Dict containing summary and actionable feedback
    """
    try:
        logger.info("Starting content analysis with Gemini...")
        
        # Initialize Gemini model
        model = GenerativeModel("gemini-1.5-flash-001")
        
        # Construct the prompt
        prompt = f"""You are an expert FAANG interview coach. Analyze the following interview answer that I will provide. 
        Evaluate it for clarity, structure (like the STAR method), and confidence. 
        Provide your feedback in a JSON format with two keys: 
        'summary' (a one-sentence overview) and 
        'actionable_feedback' (a list of 3 bullet points for improvement).

        Interview Answer:
        "{transcript}"

        Please respond with valid JSON only, no additional text."""
        
        # Generate response
        response = model.generate_content(prompt)
        
        # Parse JSON response
        try:
            # Clean the response text to extract JSON
            response_text = response.text.strip()
            
            # Remove any markdown formatting if present
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            
            feedback_data = json.loads(response_text)
            
            # Validate required keys
            if 'summary' not in feedback_data or 'actionable_feedback' not in feedback_data:
                raise ValueError("Missing required keys in Gemini response")
            
            logger.info("Content analysis completed successfully")
            return feedback_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini JSON response: {e}")
            # Return fallback response
            return {
                "summary": "Unable to analyze content structure due to processing error.",
                "actionable_feedback": [
                    "Practice speaking more clearly and at a steady pace",
                    "Structure your answer using the STAR method (Situation, Task, Action, Result)",
                    "Include specific examples and quantifiable results"
                ]
            }
            
    except Exception as e:
        logger.error(f"Gemini content analysis failed: {str(e)}")
        # Return fallback response
        return {
            "summary": "Content analysis unavailable due to technical issues.",
            "actionable_feedback": [
                "Review your answer structure and ensure it follows a logical flow",
                "Practice reducing filler words and speaking more confidently",
                "Include concrete examples to support your points"
            ]
        }


def calculate_clarity_score(speaking_pace_wpm: int, 
                          filler_word_count: int, 
                          total_words: int) -> float:
    """
    Calculate a clarity score based on speaking metrics.
    
    Args:
        speaking_pace_wpm: Words per minute
        filler_word_count: Number of filler words
        total_words: Total number of words in transcript
        
    Returns:
        float: Clarity score from 0-10
    """
    try:
        # Base score
        score = 10.0
        
        # Penalize for speaking too fast or too slow
        optimal_wpm = 150
        pace_deviation = abs(speaking_pace_wpm - optimal_wpm)
        if pace_deviation > 50:
            score -= min(3.0, pace_deviation / 50)
        
        # Penalize for filler words
        if total_words > 0:
            filler_ratio = filler_word_count / total_words
            score -= min(4.0, filler_ratio * 20)  # Heavy penalty for high filler ratio
        
        # Ensure score is between 0 and 10
        return max(0.0, min(10.0, round(score, 1)))
        
    except Exception:
        return 5.0  # Default middle score if calculation fails


def send_feedback_to_app(analysis_result: Dict[str, Any], file_name: str):
    """
    Send analysis results back to the main application.
    
    Args:
        analysis_result: Complete analysis results
        file_name: Original video filename to extract session ID
    """
    try:
        # Extract session ID from filename (format: interviews/userId/sessionId/timestamp_filename)
        path_parts = file_name.split('/')
        if len(path_parts) >= 3:
            session_id = path_parts[2]
            
            # Send results to application API
            app_endpoint = os.environ.get('APP_FEEDBACK_ENDPOINT', 'https://your-app-domain.com/api/interviews')
            if app_endpoint:
                import requests
                
                response = requests.post(
                    f"{app_endpoint}/api/interviews/{session_id}/feedback",
                    json=analysis_result,
                    timeout=30
                )
                
                if response.ok:
                    logger.info(f"Successfully sent feedback for session {session_id}")
                else:
                    logger.error(f"Failed to send feedback: {response.status_code}")
            else:
                logger.warning("APP_FEEDBACK_ENDPOINT not configured")
        else:
            logger.error(f"Could not extract session ID from filename: {file_name}")
            
    except Exception as e:
        logger.error(f"Failed to send feedback to app: {str(e)}")
        # Don't raise exception as analysis is complete


def cleanup_temp_files(temp_dir: str, 
                      video_path: Optional[str] = None, 
                      audio_path: Optional[str] = None):
    """
    Clean up temporary files and directories.
    
    Args:
        temp_dir: Temporary directory to remove
        video_path: Path to video file (optional)
        audio_path: Path to audio file (optional)
    """
    try:
        import shutil
        
        # Remove individual files if they exist
        for file_path in [video_path, audio_path]:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Removed temporary file: {file_path}")
        
        # Remove entire temporary directory
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            logger.info(f"Cleaned up temporary directory: {temp_dir}")
            
    except Exception as e:
        logger.warning(f"Cleanup warning: {str(e)}")
        # Don't raise exception for cleanup failures
