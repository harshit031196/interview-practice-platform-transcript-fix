import json
import logging
import os
import asyncio
import concurrent.futures
from datetime import datetime
from typing import Dict, List, Any, Optional
from google.cloud import storage, speech, videointelligence
from google.cloud.speech import RecognitionAudio, RecognitionConfig
from google.cloud.videointelligence import VideoIntelligenceServiceClient
from flask import Request
import functions_framework
import cv2
import numpy as np
from google.cloud import vision
import tempfile
import subprocess
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'wingman-interview-videos')
FILLER_WORDS = ['um', 'uh', 'ah', 'like', 'you know', 'so', 'well', 'actually', 'basically', 'literally']

class VideoAnalysisService:
    def __init__(self):
        self.storage_client = storage.Client()
        self.speech_client = speech.SpeechClient()
        self.vision_client = vision.ImageAnnotatorClient()
        self.video_client = videointelligence.VideoIntelligenceServiceClient()

    def _parse_gs_uri(self, gs_uri: str):
        """Parse a gs://bucket/path/to/object URI into (bucket, object_name)."""
        if not gs_uri or not gs_uri.startswith('gs://'):
            raise ValueError(f"Invalid GCS URI: {gs_uri}")
        without_scheme = gs_uri[len('gs://'):]  # bucket/obj
        parts = without_scheme.split('/', 1)
        if len(parts) == 1:
            return parts[0], ''
        return parts[0], parts[1]

    async def analyze_video_comprehensive(self, video_uri: str) -> Dict[str, Any]:
        """
        Perform comprehensive analysis of video including speech, facial expressions, and confidence metrics.
        """
        logger.info(f"Starting comprehensive analysis for video: {video_uri}")
        
        # Run analyses in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            # Submit all analysis tasks
            speech_future = executor.submit(self.analyze_speech, video_uri)
            facial_future = executor.submit(self.analyze_facial_expressions, video_uri)
            confidence_future = executor.submit(self.analyze_confidence_metrics, video_uri)
            
            # Wait for all results
            speech_analysis = speech_future.result()
            facial_analysis = facial_future.result()
            confidence_analysis = confidence_future.result()
        
        # Combine all analyses
        comprehensive_analysis = {
            'video_uri': video_uri,
            'timestamp': datetime.utcnow().isoformat(),
            'speech_analysis': speech_analysis,
            'facial_analysis': facial_analysis,
            'confidence_analysis': confidence_analysis,
            'overall_score': self.calculate_overall_score(speech_analysis, facial_analysis, confidence_analysis)
        }
        
        logger.info("Comprehensive analysis completed successfully")
        return comprehensive_analysis

    def analyze_speech(self, video_uri: str) -> Dict[str, Any]:
        """
        Analyze speech using Google Cloud Speech-to-Text API.
        Extract transcription, filler words, pacing, and clarity metrics.
        """
        logger.info("Starting speech analysis")
        
        try:
            # Configure speech recognition
            config = RecognitionConfig(
                encoding=RecognitionConfig.AudioEncoding.WEBM_OPUS,
                sample_rate_hertz=48000,
                language_code="en-US",
                enable_word_time_offsets=True,
                enable_automatic_punctuation=True,
                model="video"
            )
            
            audio = RecognitionAudio(uri=video_uri)
            
            # Perform speech recognition
            operation = self.speech_client.long_running_recognize(config=config, audio=audio)
            response = operation.result(timeout=300)  # 5 minutes timeout
            
            # Process results
            transcript_parts = []
            word_timestamps = []
            total_words = 0
            filler_word_count = 0
            
            for result in response.results:
                alternative = result.alternatives[0]
                transcript_parts.append(alternative.transcript)
                
                for word_info in alternative.words:
                    word = word_info.word.lower().strip('.,!?')
                    start_time = word_info.start_time.total_seconds()
                    end_time = word_info.end_time.total_seconds()
                    
                    word_timestamps.append({
                        'word': word,
                        'start_time': start_time,
                        'end_time': end_time,
                        'duration': end_time - start_time
                    })
                    
                    total_words += 1
                    if word in FILLER_WORDS:
                        filler_word_count += 1
            
            # Calculate metrics
            full_transcript = ' '.join(transcript_parts)
            total_duration = word_timestamps[-1]['end_time'] - word_timestamps[0]['start_time'] if word_timestamps else 0
            words_per_minute = (total_words / total_duration) * 60 if total_duration > 0 else 0
            filler_percentage = (filler_word_count / total_words) * 100 if total_words > 0 else 0
            
            # Analyze pacing variations
            pacing_analysis = self.analyze_pacing_variations(word_timestamps)
            
            return {
                'transcript': full_transcript,
                'total_words': total_words,
                'total_duration_seconds': total_duration,
                'words_per_minute': words_per_minute,
                'filler_words': {
                    'count': filler_word_count,
                    'percentage': filler_percentage,
                    'details': self.get_filler_word_details(word_timestamps)
                },
                'pacing_analysis': pacing_analysis,
                'clarity_score': self.calculate_clarity_score(filler_percentage, words_per_minute),
                'word_timestamps': word_timestamps
            }
            
        except Exception as e:
            logger.error(f"Speech analysis failed: {str(e)}")
            return {'error': str(e)}

    def analyze_facial_expressions(self, video_uri: str) -> Dict[str, Any]:
        """
        Analyze facial expressions using Google Cloud Vision AI.
        Extract emotion data over time.
        """
        logger.info("Starting facial expression analysis")
        
        try:
            # Download video temporarily for frame extraction
            # Parse full object path from gs:// URI
            bkt_name, obj_name = self._parse_gs_uri(video_uri)
            bucket = self.storage_client.bucket(bkt_name)
            blob = bucket.blob(obj_name)
            
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_video:
                blob.download_to_filename(temp_video.name)
                
                # Extract frames at 1-second intervals
                frames_data = self.extract_video_frames(temp_video.name, interval_seconds=1)
                
                # Analyze each frame for facial expressions
                emotion_timeline = []
                
                for frame_data in frames_data:
                    timestamp = frame_data['timestamp']
                    frame_image = frame_data['image']
                    
                    # Convert frame to bytes for Vision API
                    _, buffer = cv2.imencode('.jpg', frame_image)
                    image_bytes = buffer.tobytes()
                    
                    # Analyze facial expressions
                    image = vision.Image(content=image_bytes)
                    response = self.vision_client.face_detection(image=image)
                    faces = response.face_annotations
                    
                    if faces:
                        face = faces[0]  # Analyze the first detected face
                        emotions = {
                            'joy': self.likelihood_to_score(face.joy_likelihood),
                            'sorrow': self.likelihood_to_score(face.sorrow_likelihood),
                            'anger': self.likelihood_to_score(face.anger_likelihood),
                            'surprise': self.likelihood_to_score(face.surprise_likelihood),
                            'under_exposed': self.likelihood_to_score(face.under_exposed_likelihood),
                            'blurred': self.likelihood_to_score(face.blurred_likelihood),
                            'headwear': self.likelihood_to_score(face.headwear_likelihood)
                        }
                        
                        emotion_timeline.append({
                            'timestamp': timestamp,
                            'emotions': emotions,
                            'detection_confidence': face.detection_confidence
                        })
                
                # Clean up temporary file
                os.unlink(temp_video.name)
                
                # Calculate emotion statistics
                emotion_stats = self.calculate_emotion_statistics(emotion_timeline)
                
                return {
                    'emotion_timeline': emotion_timeline,
                    'emotion_statistics': emotion_stats,
                    'total_frames_analyzed': len(emotion_timeline),
                    'average_detection_confidence': sum(frame['detection_confidence'] for frame in emotion_timeline) / len(emotion_timeline) if emotion_timeline else 0
                }
                
        except Exception as e:
            logger.error(f"Facial expression analysis failed: {str(e)}")
            return {'error': str(e)}

    def analyze_confidence_metrics(self, video_uri: str) -> Dict[str, Any]:
        """
        Analyze confidence metrics using head pose and eye contact estimation.
        """
        logger.info("Starting confidence analysis")
        
        try:
            # Download video temporarily
            bkt_name, obj_name = self._parse_gs_uri(video_uri)
            bucket = self.storage_client.bucket(bkt_name)
            blob = bucket.blob(obj_name)
            
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_video:
                blob.download_to_filename(temp_video.name)
                
                # Extract frames for head pose analysis
                frames_data = self.extract_video_frames(temp_video.name, interval_seconds=0.5)
                
                head_pose_timeline = []
                eye_contact_estimates = []
                
                for frame_data in frames_data:
                    timestamp = frame_data['timestamp']
                    frame_image = frame_data['image']
                    
                    # Convert frame to bytes for Vision API
                    _, buffer = cv2.imencode('.jpg', frame_image)
                    image_bytes = buffer.tobytes()
                    
                    # Analyze head pose
                    image = vision.Image(content=image_bytes)
                    response = self.vision_client.face_detection(image=image)
                    faces = response.face_annotations
                    
                    if faces:
                        face = faces[0]
                        
                        # Extract head pose angles
                        roll_angle = face.roll_angle
                        pan_angle = face.pan_angle
                        tilt_angle = face.tilt_angle
                        
                        # Estimate eye contact (looking at camera)
                        eye_contact_score = self.estimate_eye_contact(pan_angle, tilt_angle, roll_angle)
                        
                        head_pose_timeline.append({
                            'timestamp': timestamp,
                            'roll_angle': roll_angle,
                            'pan_angle': pan_angle,
                            'tilt_angle': tilt_angle,
                            'eye_contact_score': eye_contact_score
                        })
                        
                        eye_contact_estimates.append(eye_contact_score)
                
                # Clean up temporary file
                os.unlink(temp_video.name)
                
                # Calculate confidence metrics
                avg_eye_contact = sum(eye_contact_estimates) / len(eye_contact_estimates) if eye_contact_estimates else 0
                eye_contact_consistency = self.calculate_consistency(eye_contact_estimates)
                head_stability = self.calculate_head_stability(head_pose_timeline)
                
                return {
                    'head_pose_timeline': head_pose_timeline,
                    'average_eye_contact_score': avg_eye_contact,
                    'eye_contact_consistency': eye_contact_consistency,
                    'head_stability_score': head_stability,
                    'confidence_score': self.calculate_confidence_score(avg_eye_contact, eye_contact_consistency, head_stability)
                }
                
        except Exception as e:
            logger.error(f"Confidence analysis failed: {str(e)}")
            return {'error': str(e)}

    def extract_video_frames(self, video_path: str, interval_seconds: float = 1.0) -> List[Dict[str, Any]]:
        """Extract frames from video at specified intervals."""
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = int(fps * interval_seconds)
        
        frames = []
        frame_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % frame_interval == 0:
                timestamp = frame_count / fps
                frames.append({
                    'timestamp': timestamp,
                    'image': frame,
                    'frame_number': frame_count
                })
            
            frame_count += 1
        
        cap.release()
        return frames

    def likelihood_to_score(self, likelihood) -> float:
        """Convert Vision API likelihood to numerical score."""
        likelihood_scores = {
            0: 0.0,  # UNKNOWN
            1: 0.1,  # VERY_UNLIKELY
            2: 0.3,  # UNLIKELY
            3: 0.5,  # POSSIBLE
            4: 0.7,  # LIKELY
            5: 0.9   # VERY_LIKELY
        }
        return likelihood_scores.get(likelihood, 0.0)

    def estimate_eye_contact(self, pan_angle: float, tilt_angle: float, roll_angle: float) -> float:
        """Estimate eye contact score based on head pose angles."""
        # Ideal angles for eye contact (looking straight at camera)
        ideal_pan = 0.0
        ideal_tilt = 0.0
        ideal_roll = 0.0
        
        # Calculate deviation from ideal angles
        pan_deviation = abs(pan_angle - ideal_pan)
        tilt_deviation = abs(tilt_angle - ideal_tilt)
        roll_deviation = abs(roll_angle - ideal_roll)
        
        # Weight the deviations (pan is most important for eye contact)
        weighted_deviation = (pan_deviation * 0.6) + (tilt_deviation * 0.3) + (roll_deviation * 0.1)
        
        # Convert to score (0-1, where 1 is perfect eye contact)
        max_acceptable_deviation = 30.0  # degrees
        eye_contact_score = max(0.0, 1.0 - (weighted_deviation / max_acceptable_deviation))
        
        return eye_contact_score

    def analyze_pacing_variations(self, word_timestamps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze pacing variations throughout the speech."""
        if len(word_timestamps) < 10:
            return {'error': 'Insufficient data for pacing analysis'}
        
        # Calculate WPM for sliding windows
        window_size = 10  # words
        window_wpms = []
        
        for i in range(len(word_timestamps) - window_size + 1):
            window = word_timestamps[i:i + window_size]
            duration = window[-1]['end_time'] - window[0]['start_time']
            wpm = (window_size / duration) * 60 if duration > 0 else 0
            window_wpms.append(wpm)
        
        # Calculate statistics
        avg_wpm = sum(window_wpms) / len(window_wpms)
        wpm_std = np.std(window_wpms)
        
        return {
            'average_wpm': avg_wpm,
            'wpm_standard_deviation': wpm_std,
            'pacing_consistency': max(0.0, 1.0 - (wpm_std / avg_wpm)) if avg_wpm > 0 else 0.0,
            'wpm_timeline': window_wpms
        }

    def get_filler_word_details(self, word_timestamps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Get detailed information about filler words."""
        filler_details = []
        for word_data in word_timestamps:
            if word_data['word'] in FILLER_WORDS:
                filler_details.append({
                    'word': word_data['word'],
                    'timestamp': word_data['start_time'],
                    'duration': word_data['duration']
                })
        return filler_details

    def calculate_clarity_score(self, filler_percentage: float, words_per_minute: float) -> float:
        """Calculate overall clarity score based on filler words and pacing."""
        # Ideal WPM range is 150-160
        ideal_wpm = 155
        wpm_score = max(0.0, 1.0 - abs(words_per_minute - ideal_wpm) / 100)
        
        # Lower filler percentage is better
        filler_score = max(0.0, 1.0 - (filler_percentage / 20))  # 20% filler words = 0 score
        
        # Weighted combination
        clarity_score = (wpm_score * 0.6) + (filler_score * 0.4)
        return min(1.0, max(0.0, clarity_score))

    def calculate_emotion_statistics(self, emotion_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate statistics for emotions over time."""
        if not emotion_timeline:
            return {}
        
        emotion_keys = ['joy', 'sorrow', 'anger', 'surprise']
        stats = {}
        
        for emotion in emotion_keys:
            values = [frame['emotions'][emotion] for frame in emotion_timeline]
            stats[emotion] = {
                'average': sum(values) / len(values),
                'max': max(values),
                'min': min(values),
                'std': float(np.std(values))
            }
        
        return stats

    def calculate_consistency(self, values: List[float]) -> float:
        """Calculate consistency score (1 - coefficient of variation)."""
        if not values or len(values) < 2:
            return 0.0
        
        mean_val = sum(values) / len(values)
        if mean_val == 0:
            return 0.0
        
        std_val = np.std(values)
        cv = std_val / mean_val
        return max(0.0, 1.0 - cv)

    def calculate_head_stability(self, head_pose_timeline: List[Dict[str, Any]]) -> float:
        """Calculate head stability score based on pose variations."""
        if not head_pose_timeline:
            return 0.0
        
        # Calculate standard deviations for each angle
        pan_angles = [frame['pan_angle'] for frame in head_pose_timeline]
        tilt_angles = [frame['tilt_angle'] for frame in head_pose_timeline]
        roll_angles = [frame['roll_angle'] for frame in head_pose_timeline]
        
        pan_std = np.std(pan_angles)
        tilt_std = np.std(tilt_angles)
        roll_std = np.std(roll_angles)
        
        # Lower standard deviation = higher stability
        avg_std = (pan_std + tilt_std + roll_std) / 3
        stability_score = max(0.0, 1.0 - (avg_std / 30))  # 30 degrees std = 0 stability
        
        return stability_score

    def calculate_confidence_score(self, eye_contact: float, consistency: float, stability: float) -> float:
        """Calculate overall confidence score."""
        return (eye_contact * 0.5) + (consistency * 0.3) + (stability * 0.2)

    def calculate_overall_score(self, speech_analysis: Dict[str, Any], 
                              facial_analysis: Dict[str, Any], 
                              confidence_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overall interview performance score."""
        scores = {}
        
        # Extract individual scores
        if 'clarity_score' in speech_analysis:
            scores['speech_clarity'] = speech_analysis['clarity_score']
        
        if 'emotion_statistics' in facial_analysis and 'joy' in facial_analysis['emotion_statistics']:
            scores['positivity'] = facial_analysis['emotion_statistics']['joy']['average']
        
        if 'confidence_score' in confidence_analysis:
            scores['confidence'] = confidence_analysis['confidence_score']
        
        # Calculate weighted overall score
        if scores:
            overall_score = sum(scores.values()) / len(scores)
            return {
                'overall_score': overall_score,
                'component_scores': scores,
                'grade': self.score_to_grade(overall_score)
            }
        
        return {'overall_score': 0.0, 'component_scores': {}, 'grade': 'F'}

    def score_to_grade(self, score: float) -> str:
        """Convert numerical score to letter grade."""
        if score >= 0.9:
            return 'A+'
        elif score >= 0.85:
            return 'A'
        elif score >= 0.8:
            return 'A-'
        elif score >= 0.75:
            return 'B+'
        elif score >= 0.7:
            return 'B'
        elif score >= 0.65:
            return 'B-'
        elif score >= 0.6:
            return 'C+'
        elif score >= 0.55:
            return 'C'
        elif score >= 0.5:
            return 'C-'
        elif score >= 0.45:
            return 'D+'
        elif score >= 0.4:
            return 'D'
        else:
            return 'F'


# Initialize the analysis service
analysis_service = VideoAnalysisService()

@functions_framework.http
def analyze_video(request: Request):
    """
    Google Cloud Function to analyze uploaded videos for interview feedback.
    Performs speech analysis, facial expression analysis, and confidence metrics.
    """
    
    # Set CORS headers
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }
    
    try:
        if request.method != 'POST':
            return json.dumps({'error': 'Only POST method allowed'}), 405, headers
        
        request_json = request.get_json(silent=True)
        if not request_json:
            return json.dumps({'error': 'No JSON body provided'}), 400, headers
        
        video_uri = request_json.get('videoUri')
        if not video_uri:
            return json.dumps({'error': 'videoUri is required'}), 400, headers
        
        logger.info(f"Starting analysis for video: {video_uri}")
        
        # Perform comprehensive analysis
        analysis_result = asyncio.run(analysis_service.analyze_video_comprehensive(video_uri))
        
        logger.info("Analysis completed successfully")
        return json.dumps(analysis_result), 200, headers
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return json.dumps({'error': str(e)}), 500, headers
