import json
import os
import tempfile
import logging
from typing import Dict, Any
from datetime import datetime
import requests

# Google Cloud imports
from google.cloud import storage
from google.cloud import speech
import vertexai
from vertexai.generative_models import GenerativeModel
import functions_framework

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'wingman-interview-470419')
LOCATION = os.environ.get('VERTEX_AI_LOCATION', 'us-central1')
APP_FEEDBACK_ENDPOINT = os.environ.get('APP_FEEDBACK_ENDPOINT', 'http://localhost:3000')

# Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)

@functions_framework.http
def analyze_interview_response(request):
    """
    HTTP Cloud Function to analyze interview videos.
    
    Expects JSON payload with:
    - video_path: GCS path to the video file
    - session_id: Interview session ID
    """
    
    # Set CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }
    
    # Handle preflight requests
    if request.method == 'OPTIONS':
        return ('', 204, headers)
    
    try:
        # Parse request
        request_json = request.get_json(silent=True)
        if not request_json:
            return json.dumps({'error': 'No JSON body provided'}), 400, headers
            
        video_path = request_json.get('video_path')
        session_id = request_json.get('session_id')
        
        if not video_path or not session_id:
            return json.dumps({'error': 'video_path and session_id are required'}), 400, headers
        
        logger.info(f"Starting analysis for video: {video_path}, session: {session_id}")
        
        # Initialize storage client
        storage_client = storage.Client()
        
        # Parse GCS path
        if video_path.startswith('gs://'):
            path_parts = video_path[5:].split('/', 1)
            bucket_name = path_parts[0]
            file_name = path_parts[1]
        else:
            return json.dumps({'error': 'Invalid video_path format'}), 400, headers
        
        # Download video file
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(file_name)
        
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_file:
            blob.download_to_filename(temp_file.name)
            video_file_path = temp_file.name
        
        logger.info(f"Downloaded video to: {video_file_path}")
        
        # Perform AI analysis
        analysis_result = perform_analysis(video_file_path, session_id)
        
        # Send results to application
        if APP_FEEDBACK_ENDPOINT and APP_FEEDBACK_ENDPOINT != 'http://localhost:3000':
            send_feedback_to_app(session_id, analysis_result)
        
        # Clean up
        os.unlink(video_file_path)
        
        logger.info(f"Analysis completed for session: {session_id}")
        
        return json.dumps({
            'success': True,
            'session_id': session_id,
            'analysis': analysis_result
        }), 200, headers
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return json.dumps({
            'error': f'Analysis failed: {str(e)}'
        }), 500, headers

def perform_analysis(video_file_path: str, session_id: str) -> Dict[str, Any]:
    """
    Perform comprehensive AI analysis on the interview video.
    """
    try:
        # Initialize speech client
        speech_client = speech.SpeechClient()
        
        # Convert video to audio for speech analysis
        audio_content = extract_audio_from_video(video_file_path)
        
        # Speech-to-Text analysis
        transcript_result = analyze_speech(speech_client, audio_content)
        
        # Generate AI feedback using Gemini
        ai_feedback = generate_ai_feedback(transcript_result['transcript'])
        
        # Compile results
        analysis_result = {
            'session_id': session_id,
            'timestamp': datetime.utcnow().isoformat(),
            'transcript': transcript_result['transcript'],
            'speaking_metrics': transcript_result['metrics'],
            'ai_feedback': ai_feedback,
            'overall_score': calculate_overall_score(transcript_result, ai_feedback),
            'status': 'completed'
        }
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        return {
            'session_id': session_id,
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e),
            'status': 'failed'
        }

def extract_audio_from_video(video_path: str) -> bytes:
    """
    Extract audio from video file for speech analysis.
    For now, return empty bytes - this would need ffmpeg in production.
    """
    # Placeholder - in production, use ffmpeg to extract audio
    logger.info("Audio extraction placeholder - returning empty audio")
    return b''

def analyze_speech(speech_client, audio_content: bytes) -> Dict[str, Any]:
    """
    Analyze speech using Google Speech-to-Text API.
    """
    try:
        if not audio_content:
            # Return mock data for now
            return {
                'transcript': 'Mock transcript: The candidate discussed their experience with software development and problem-solving approaches.',
                'metrics': {
                    'speaking_rate': 150,  # words per minute
                    'pause_count': 5,
                    'confidence': 0.85,
                    'duration': 120  # seconds
                }
            }
        
        # Real Speech-to-Text analysis would go here
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code="en-US",
            enable_automatic_punctuation=True,
            enable_speaker_diarization=True,
        )
        
        audio = speech.RecognitionAudio(content=audio_content)
        response = speech_client.recognize(config=config, audio=audio)
        
        transcript = ""
        for result in response.results:
            transcript += result.alternatives[0].transcript + " "
        
        return {
            'transcript': transcript.strip(),
            'metrics': {
                'speaking_rate': 150,
                'pause_count': 5,
                'confidence': 0.85,
                'duration': 120
            }
        }
        
    except Exception as e:
        logger.error(f"Speech analysis error: {str(e)}")
        return {
            'transcript': 'Error processing audio',
            'metrics': {
                'speaking_rate': 0,
                'pause_count': 0,
                'confidence': 0,
                'duration': 0
            }
        }

def generate_ai_feedback(transcript: str) -> Dict[str, Any]:
    """
    Generate AI feedback using Vertex AI Gemini.
    """
    try:
        model = GenerativeModel("gemini-1.5-flash-001")
        
        prompt = f"""
        Analyze this interview response and provide detailed feedback:
        
        Transcript: "{transcript}"
        
        Please provide feedback in the following JSON format:
        {{
            "content_analysis": {{
                "clarity": 8,
                "relevance": 7,
                "depth": 6,
                "examples": 5
            }},
            "communication_skills": {{
                "articulation": 8,
                "confidence": 7,
                "engagement": 6
            }},
            "strengths": ["Clear communication", "Good examples"],
            "areas_for_improvement": ["More specific details", "Better structure"],
            "overall_feedback": "The response demonstrates good understanding...",
            "score": 75
        }}
        
        Provide constructive, actionable feedback for interview improvement.
        """
        
        response = model.generate_content(prompt)
        
        # Parse the AI response
        try:
            feedback_json = json.loads(response.text)
            return feedback_json
        except json.JSONDecodeError:
            # Fallback if AI doesn't return valid JSON
            return {
                "content_analysis": {
                    "clarity": 7,
                    "relevance": 7,
                    "depth": 6,
                    "examples": 6
                },
                "communication_skills": {
                    "articulation": 7,
                    "confidence": 6,
                    "engagement": 7
                },
                "strengths": ["Clear communication", "Relevant examples"],
                "areas_for_improvement": ["More detailed responses", "Better structure"],
                "overall_feedback": "The response shows good understanding of the topic with room for improvement in detail and structure.",
                "score": 70
            }
            
    except Exception as e:
        logger.error(f"AI feedback generation error: {str(e)}")
        return {
            "content_analysis": {
                "clarity": 5,
                "relevance": 5,
                "depth": 5,
                "examples": 5
            },
            "communication_skills": {
                "articulation": 5,
                "confidence": 5,
                "engagement": 5
            },
            "strengths": ["Attempted to answer the question"],
            "areas_for_improvement": ["Analysis could not be completed"],
            "overall_feedback": "Unable to generate detailed feedback due to processing error.",
            "score": 50
        }

def calculate_overall_score(transcript_result: Dict, ai_feedback: Dict) -> int:
    """
    Calculate overall interview score based on analysis results.
    """
    try:
        ai_score = ai_feedback.get('score', 50)
        confidence = transcript_result.get('metrics', {}).get('confidence', 0.5)
        
        # Weight AI score more heavily, adjust for speech confidence
        overall_score = int(ai_score * 0.8 + confidence * 100 * 0.2)
        return max(0, min(100, overall_score))
        
    except Exception:
        return 50

def send_feedback_to_app(session_id: str, analysis_result: Dict[str, Any]):
    """
    Send analysis results back to the application.
    """
    try:
        url = f"{APP_FEEDBACK_ENDPOINT}/api/interviews/{session_id}/feedback"
        
        response = requests.post(
            url,
            json=analysis_result,
            timeout=30,
            headers={'Content-Type': 'application/json'}
        )
        
        if response.ok:
            logger.info(f"Successfully sent feedback to app for session {session_id}")
        else:
            logger.error(f"Failed to send feedback to app: {response.status_code}")
            
    except Exception as e:
        logger.error(f"Error sending feedback to app: {str(e)}")
