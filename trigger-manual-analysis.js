const { PrismaClient } = require('@prisma/client');
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');

const prisma = new PrismaClient();
const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});

async function triggerVideoAnalysis() {
  try {
    const sessionId = 'cmey27d3o0001ezpps8sykzzs';
    const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey27d3o0001ezpps8sykzzs/1756546149216_interview_cmey27d3o0001ezpps8sykzzs_1756546148855.webm';
    
    // Get session details
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      console.log('❌ Session not found');
      return;
    }
    
    console.log('🎬 Starting video analysis for session:', sessionId);
    console.log('📹 Video URI:', videoUri);
    
    // Configure analysis features
    const features = [
      'FACE_DETECTION',
      'PERSON_DETECTION', 
      'SPEECH_TRANSCRIPTION',
      'TEXT_DETECTION'
    ];

    // Start video analysis
    const [operation] = await videoClient.annotateVideo({
      inputUri: videoUri,
      features: features,
      videoContext: {
        speechTranscriptionConfig: {
          languageCode: 'en-US',
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: 2,
          enableAutomaticPunctuation: true,
        },
        faceDetectionConfig: {
          includeBoundingBoxes: true,
          includeAttributes: true,
        },
        personDetectionConfig: {
          includeBoundingBoxes: true,
          includeAttributes: true,
          includePoseLandmarks: true,
        }
      },
    });

    console.log('⏳ Video analysis operation started, waiting for completion...');
    const [result] = await operation.promise();
    console.log('✅ Video analysis operation completed');

    // Process results
    const analysisResults = {
      videoAnalysis: {
        duration: result.annotationResults?.[0]?.inputUri ? 'Available' : 'Unknown',
        faceDetection: processFaceDetection(result.annotationResults?.[0]?.faceDetectionAnnotations || []),
        speechTranscription: processSpeechTranscription(result.annotationResults?.[0]?.speechTranscriptions || []),
        personDetection: processPersonDetection(result.annotationResults?.[0]?.personDetectionAnnotations || []),
        textDetection: processTextDetection(result.annotationResults?.[0]?.textAnnotations || []),
        confidence: calculateOverallConfidence(result.annotationResults?.[0]),
        timestamp: new Date().toISOString()
      }
    };

    // Store in database
    await prisma.videoAnalysis.upsert({
      where: {
        sessionId_userId: {
          sessionId: sessionId,
          userId: session.intervieweeId,
        }
      },
      update: {
        results: JSON.stringify(analysisResults),
        updatedAt: new Date(),
      },
      create: {
        sessionId: sessionId,
        userId: session.intervieweeId,
        results: JSON.stringify(analysisResults),
      },
    });

    console.log('💾 Analysis results stored successfully');
    console.log('📊 Results summary:', {
      faceDetected: analysisResults.videoAnalysis.faceDetection.detected,
      speechDetected: analysisResults.videoAnalysis.speechTranscription.hasAudio,
      personDetected: analysisResults.videoAnalysis.personDetection.detected,
      overallConfidence: analysisResults.videoAnalysis.confidence
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Video analysis failed:', error.message);
    await prisma.$disconnect();
  }
}

// Helper functions
function processFaceDetection(faceAnnotations) {
  if (!faceAnnotations.length) return { detected: false, count: 0 };
  
  const faces = faceAnnotations.map(annotation => ({
    confidence: annotation.tracks?.[0]?.confidence || 0,
    emotions: annotation.tracks?.[0]?.timestampedObjects?.[0]?.attributes || [],
    duration: annotation.tracks?.[0]?.segment || {}
  }));

  return {
    detected: true,
    count: faces.length,
    averageConfidence: faces.reduce((sum, face) => sum + face.confidence, 0) / faces.length,
    faces: faces.slice(0, 5)
  };
}

function processSpeechTranscription(speechAnnotations) {
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

triggerVideoAnalysis();
