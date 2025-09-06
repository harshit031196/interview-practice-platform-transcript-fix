const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function checkRecentVideoAnalysis() {
  try {
    // Extract session ID from the recent video URL
    // From the latest completed session in check-recent-sessions.js
    const sessionId = 'cmezlqlen000riwlacvdd4oot';
    const userId = 'cmezelnx5000057j9br3cf1y9';
    const videoUrl = `https://storage.cloud.google.com/wingman-interview-videos-harshit-2024/interviews/${userId}/${sessionId}/video.webm`;

    console.log('🎥 Checking Recent Video Analysis Status');
    console.log('=======================================');
    console.log('Session ID:', sessionId);
    console.log('User ID:', userId);
    console.log('Video URL:', videoUrl);
    console.log('');

    // Check if session exists
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        interviewee: true,
        feedback: true
      }
    });

    if (!session) {
      console.log('❌ Session not found in database');
      return;
    }

    console.log('✅ Session found:', {
      id: session.id,
      type: session.type,
      status: session.status,
      isConversational: session.isConversational,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      interviewee: session.interviewee.email,
      createdAt: session.createdAt
    });

    // Check for video analysis results
    const videoAnalysis = await prisma.videoAnalysis.findMany({
      where: {
        sessionId: sessionId,
        userId: userId
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('\n📊 Video Analysis Results:');
    if (videoAnalysis.length === 0) {
      console.log('❌ No video analysis found for this session');
    } else {
      videoAnalysis.forEach((analysis, index) => {
        console.log(`${index + 1}. Analysis ID: ${analysis.id}`);
        console.log(`   Created: ${analysis.createdAt}`);
        console.log(`   Updated: ${analysis.updatedAt}`);
        
        try {
          const results = JSON.parse(analysis.results);
          console.log(`   Status: ${results.status || 'Completed'}`);
          console.log(`   Has Face Analysis: ${!!results.faceDetection}`);
          console.log(`   Has Speech Analysis: ${!!results.speechTranscription}`);
          console.log(`   Has Person Detection: ${!!results.personDetection}`);
          console.log(`   Overall Confidence: ${results.confidence || 'N/A'}`);
          
          if (results.speechTranscription) {
            console.log(`   Speech Transcript: "${results.speechTranscription.transcript || 'N/A'}"`);
            console.log(`   Speech Confidence: ${results.speechTranscription.confidence || 'N/A'}`);
          }
        } catch (e) {
          console.log(`   Raw Results Length: ${analysis.results.length} characters`);
        }
      });
    }

    // Check for interview feedback
    console.log('\n💬 Interview Feedback:');
    if (!session.feedback) {
      console.log('❌ No interview feedback found');
    } else {
      console.log('✅ Feedback found:', {
        id: session.feedback.id,
        speakingPace: session.feedback.speakingPaceWpm,
        fillerWords: session.feedback.fillerWordCount,
        clarityScore: session.feedback.clarityScore,
        createdAt: session.feedback.createdAt
      });
    }


    // Check for vision analysis frames
    console.log('\n👁️ Vision Analysis Frames:');
    const visionFrames = await prisma.visionAnalysisFrame.findMany({
      where: { sessionId: sessionId },
      orderBy: { timestamp: 'asc' },
    });

    if (visionFrames.length === 0) {
      console.log('❌ No vision analysis frames found for this session');
    } else {
      console.log(`✅ Found ${visionFrames.length} vision analysis frames.`);
      console.log('Sample frame:', {
        timestamp: visionFrames[0].timestamp,
        joyLikelihood: visionFrames[0].joyLikelihood,
        eyeContact: visionFrames[0].eyeContact,
        confidence: visionFrames[0].confidence,
      });
    }

    // Calculate time since session creation to see if this is truly recent
    const now = new Date();
    const sessionCreated = new Date(session.createdAt);
    const timeDiff = Math.round((now - sessionCreated) / (1000 * 60)); // minutes
    
    console.log('\n⏰ Session Timing:');
    console.log(`Session created ${timeDiff} minutes ago`);
    if (timeDiff < 30) {
      console.log('✅ This is a recent session (< 30 minutes old)');
    } else {
      console.log('⚠️  This session is older than 30 minutes');
    }

  } catch (error) {
    console.error('❌ Error checking video analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentVideoAnalysis();
