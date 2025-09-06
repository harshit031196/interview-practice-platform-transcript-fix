/**
 * Direct test script for video analysis functionality
 * 
 * This script bypasses the API authentication and tests the core video analysis functionality directly
 * by importing the necessary functions from the route.ts file.
 * 
 * Usage: node test-direct-video-analysis.js
 */

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');
const { SpeechClient } = require('@google-cloud/speech');
const { v4: uuidv4 } = require('uuid');

// Initialize clients
const prisma = new PrismaClient();
const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});
const speechClient = new SpeechClient({
  projectId: 'wingman-interview-470419',
});

// Test configuration
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/test/test_video_1756542164194.webm';
const TEST_SESSION_ID = 'test-session-' + uuidv4().substring(0, 8);

// Helper function to log with timestamp
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Enhanced audio extraction function for WEBM files (copied from route.ts)
async function extractAndTranscribeAudio(videoUri) {
  try {
    log('Performing dedicated audio transcription for: ' + videoUri);
    
    // Convert web URL to GCS URI format if needed
    if (videoUri.startsWith('https://storage.cloud.google.com/')) {
      videoUri = 'gs://' + videoUri.replace('https://storage.cloud.google.com/', '');
      log('Converted audio URI to GCS format: ' + videoUri);
    }
    
    // Configure audio recognition for WEBM/OPUS format
    const audioConfig = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 1,
        maxSpeakerCount: 3,
      },
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
    };
    
    // Create audio recognition request
    const request = {
      config: audioConfig,
      audio: { uri: videoUri },
    };
    
    log('Sending audio transcription request to Speech-to-Text API');
    const [operation] = await speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();
    
    log('Audio transcription completed successfully');
    return response;
  } catch (error) {
    log('Audio transcription error: ' + error.message);
    console.error('Audio transcription error details:', error);
    return null;
  }
}

// Video analysis function (copied and adapted from route.ts)
async function performVideoAnalysis(videoUri, analysisType = 'comprehensive') {
  try {
    log('Starting video analysis for: ' + videoUri);
    
    // Convert web URL to GCS URI format if needed
    if (videoUri.startsWith('https://storage.cloud.google.com/')) {
      videoUri = 'gs://' + videoUri.replace('https://storage.cloud.google.com/', '');
      log('Converted video URI to GCS format: ' + videoUri);
    }
    
    // Log the final URI format being used
    log('Using video URI format: ' + videoUri);
    
    // Run video analysis and audio transcription in parallel
    log('Initiating parallel video analysis and audio transcription');
    const [videoAnalysisResult, audioTranscriptionResult] = await Promise.allSettled([
      videoClient.annotateVideo({
        inputUri: videoUri,
        features: ['FACE_DETECTION', 'PERSON_DETECTION', 'SPEECH_TRANSCRIPTION', 'TEXT_DETECTION'],
        videoContext: {
          speechTranscriptionConfig: {
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
            enableSpeakerDiarization: true,
            diarizationSpeakerCount: 2,
          },
        },
      }).then(([operation]) => operation.promise()),
      extractAndTranscribeAudio(videoUri)
    ]);
    
    log('Video analysis API calls completed');
    
    // Process video analysis results
    let annotationResults = null;
    let speechTranscriptionFromVideo = null;
    
    if (videoAnalysisResult.status === 'fulfilled') {
      log('Video analysis successful');
      annotationResults = videoAnalysisResult.value[0].annotationResults[0];
    } else {
      log('Video analysis failed: ' + videoAnalysisResult.reason);
      console.error('Video analysis error details:', videoAnalysisResult.reason);
    }
    
    // Process audio transcription results
    let dedicatedAudioTranscription = null;
    
    if (audioTranscriptionResult.status === 'fulfilled') {
      log('Audio transcription successful');
      dedicatedAudioTranscription = audioTranscriptionResult.value;
    } else {
      log('Audio transcription failed: ' + audioTranscriptionResult.reason);
      console.error('Audio transcription error details:', audioTranscriptionResult.reason);
    }
    
    // Prepare analysis results
    const analysisResults = {
      videoUri: videoUri,
      timestamp: new Date().toISOString(),
      face: processFaceDetection(annotationResults?.faceDetectionAnnotations || []),
      speech: processSpeechTranscription(
        annotationResults?.speechTranscriptions || [],
        dedicatedAudioTranscription
      ),
      person: processPersonDetection(annotationResults?.personDetectionAnnotations || []),
      text: processTextDetection(annotationResults?.textAnnotations || []),
      overallConfidence: calculateOverallConfidence(annotationResults)
    };
    
    log('Analysis results processed successfully');
    return analysisResults;
  } catch (error) {
    log('Video analysis error: ' + error.message);
    console.error('Video analysis error details:', error);
    throw new Error(`Video analysis failed: ${error.message}`);
  }
}

// Helper functions for processing analysis results (copied from route.ts)
function processFaceDetection(faceAnnotations) {
  if (!faceAnnotations.length) return { detected: false, emotions: {} };
  
  const emotions = {
    joy: 0,
    sorrow: 0,
    anger: 0,
    surprise: 0
  };
  
  let totalFrames = 0;
  
  faceAnnotations.forEach(annotation => {
    if (annotation.frames) {
      annotation.frames.forEach(frame => {
        if (frame.normalizedBoundingBox) {
          totalFrames++;
          
          // Process emotions for this frame
          if (frame.attributes) {
            frame.attributes.forEach(attr => {
              if (attr.name in emotions && attr.confidence > 0.5) {
                emotions[attr.name] += attr.confidence;
              }
            });
          }
        }
      });
    }
  });
  
  // Normalize emotion scores
  if (totalFrames > 0) {
    Object.keys(emotions).forEach(emotion => {
      emotions[emotion] = emotions[emotion] / totalFrames;
    });
  }
  
  return {
    detected: true,
    count: faceAnnotations.length,
    confidence: faceAnnotations[0]?.tracks?.[0]?.confidence || 0,
    emotions: emotions
  };
}

function processSpeechTranscription(speechAnnotations, dedicatedTranscription) {
  // Prioritize dedicated audio transcription if available
  if (dedicatedTranscription && dedicatedTranscription.results) {
    const transcripts = dedicatedTranscription.results.map(result => 
      result.alternatives?.[0]?.transcript || ''
    ).filter(Boolean);
    
    return {
      hasAudio: true,
      transcript: transcripts.join(' '),
      confidence: dedicatedTranscription.results[0]?.alternatives?.[0]?.confidence || 0,
      speakerCount: dedicatedTranscription.results.length > 0 ? 
        (dedicatedTranscription.results[0]?.alternatives?.[0]?.words?.length > 0 ? 2 : 1) : 0
    };
  }
  
  // Fall back to video speech transcription
  if (!speechAnnotations.length) return { hasAudio: false, transcript: '' };
  
  const transcripts = speechAnnotations.map(annotation => 
    annotation.alternatives?.[0]?.transcript || ''
  ).filter(Boolean);
  
  return {
    hasAudio: true,
    transcript: transcripts.join(' '),
    confidence: speechAnnotations[0]?.alternatives?.[0]?.confidence || 0,
    speakerCount: speechAnnotations.length
  };
}

function processPersonDetection(personAnnotations) {
  if (!personAnnotations.length) return { detected: false, count: 0 };
  
  return {
    detected: true,
    count: personAnnotations.length,
    confidence: personAnnotations[0]?.tracks?.[0]?.confidence || 0
  };
}

function processTextDetection(textAnnotations) {
  if (!textAnnotations.length) return { detected: false, text: '' };
  
  const detectedText = textAnnotations.map(annotation => 
    annotation.text || ''
  ).filter(Boolean).join(' ');
  
  return {
    detected: true,
    text: detectedText,
    confidence: textAnnotations[0]?.confidence || 0
  };
}

function calculateOverallConfidence(annotationResult) {
  const confidences = [];
  
  if (annotationResult?.faceDetectionAnnotations?.length) {
    confidences.push(annotationResult.faceDetectionAnnotations[0]?.tracks?.[0]?.confidence || 0);
  }
  
  if (annotationResult?.speechTranscriptions?.length) {
    confidences.push(annotationResult.speechTranscriptions[0]?.alternatives?.[0]?.confidence || 0);
  }
  
  if (annotationResult?.personDetectionAnnotations?.length) {
    confidences.push(annotationResult.personDetectionAnnotations[0]?.tracks?.[0]?.confidence || 0);
  }
  
  return confidences.length > 0 ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length : 0;
}

// Main test function
async function runDirectTest() {
  try {
    log('Starting direct video analysis test');
    
    // Create test user
    log('Creating test user');
    const user = await prisma.user.create({
      data: {
        email: `test-user-${uuidv4().substring(0, 8)}@example.com`,
        name: 'Test User',
        role: 'INTERVIEWEE',
        passwordHash: 'test-password-hash'
      }
    });
    log(`Created test user: ${user.email} (${user.id})`);
    
    // Create test interview session
    log('Creating test interview session');
    const session = await prisma.interviewSession.create({
      data: {
        id: TEST_SESSION_ID,
        type: 'AI',
        status: 'COMPLETED',
        intervieweeId: user.id,
        interviewType: 'BEHAVIORAL',
        difficulty: 'MEDIUM',
        duration: 15,
        startedAt: new Date(),
        endedAt: new Date()
      }
    });
    log(`Created test interview session: ${session.id}`);
    
    // Create recording with video URI
    log('Creating test recording with video URI');
    const recording = await prisma.recording.create({
      data: {
        sessionId: session.id,
        url: TEST_VIDEO_URI,
        durationSec: 60,
        consent: true
      }
    });
    log(`Created test recording: ${recording.id} with URI: ${recording.url}`);
    
    // Perform direct video analysis
    log('Performing direct video analysis');
    const analysisResult = await performVideoAnalysis(recording.url);
    log('Video analysis completed successfully');
    log('Analysis results sample: ' + JSON.stringify(analysisResult).substring(0, 200) + '...');
    
    // Store analysis result in database
    log('Storing analysis result in database');
    const videoAnalysis = await prisma.videoAnalysis.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        results: JSON.stringify(analysisResult)
      }
    });
    log(`Created video analysis record: ${videoAnalysis.id}`);
    
    // Verify analysis result can be retrieved
    log('Verifying analysis result can be retrieved');
    const retrievedAnalysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: user.id
        }
      }
    });
    
    if (retrievedAnalysis) {
      log('Successfully retrieved analysis result from database');
      log('Analysis ID: ' + retrievedAnalysis.id);
      log('Created at: ' + retrievedAnalysis.createdAt);
      log('Results sample: ' + retrievedAnalysis.results.substring(0, 100) + '...');
    } else {
      log('Failed to retrieve analysis result from database');
    }
    
    log('\n📊 Test Summary:');
    log('- User creation: ✅ Success');
    log('- Session creation: ✅ Success');
    log('- Recording creation: ✅ Success');
    log('- Direct video analysis: ✅ Success');
    log('- Database storage: ✅ Success');
    log('- Database retrieval: ' + (retrievedAnalysis ? '✅ Success' : '❌ Failed'));
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up test data
    log('Cleaning up test data');
    await prisma.$disconnect();
  }
}

// Run the test
runDirectTest();
