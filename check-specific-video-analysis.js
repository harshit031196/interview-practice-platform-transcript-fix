const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function checkSpecificVideoAnalysis() {
  try {
    // Extract session ID from the video URL
    const videoUrl = 'https://storage.cloud.google.com/wingman-interview-videos-harshit-2024/interviews/cmezelnx5000057j9br3cf1y9/cmezholcd0001gken4tscxbnu/1756632597435_interview_cmezholcd0001gken4tscxbnu_1756632596636.webm?authuser=8';
    const sessionId = 'cmezholcd0001gken4tscxbnu'; // Extracted from URL
    const userId = 'cmezelnx5000057j9br3cf1y9';

    console.log('🎥 Checking Video Analysis Status');
    console.log('=================================');
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
      interviewee: session.interviewee.email
    });

    // Check for video analysis results
    const videoAnalysis = await prisma.videoAnalysis.findMany({
      where: {
        sessionId: sessionId,
        userId: userId
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Check for recording with this session ID
    const recording = await prisma.recording.findUnique({
      where: {
        sessionId: sessionId
      }
    });

    console.log('\n📊 Video Analysis Results by Session ID:');
    if (videoAnalysis.length === 0) {
      console.log('❌ No video analysis found for this session');
    } else {
      videoAnalysis.forEach((analysis, index) => {
        console.log(`${index + 1}. Analysis ID: ${analysis.id}`);
        console.log(`   Created: ${analysis.createdAt}`);
        console.log(`   Updated: ${analysis.updatedAt}`);
        
        try {
          const results = JSON.parse(analysis.results);
          console.log(`   Status: ${results.status || 'Unknown'}`);
          console.log(`   Has Face Analysis: ${!!results.faceAnalysis}`);
          console.log(`   Has Speech Analysis: ${!!results.speechAnalysis}`);
          console.log(`   Has Person Detection: ${!!results.personDetection}`);
          console.log(`   Overall Confidence: ${results.overallConfidence || 'N/A'}`);
        } catch (e) {
          console.log(`   Raw Results Length: ${analysis.results.length} characters`);
        }
      });
    }

    // Check for recording information
    console.log('\n📹 Recording Information:');
    if (!recording) {
      console.log('❌ No recording found for this session');
    } else {
      console.log('✅ Recording found:', {
        id: recording.id,
        url: recording.url,
        durationSec: recording.durationSec,
        consent: recording.consent
      });
      
      // Check if the recording URL matches our expected video URL
      if (recording.url.includes('cmezholcd0001gken4tscxbnu')) {
        console.log('✅ Recording URL matches the expected video URL');
      } else {
        console.log('❌ Recording URL does not match the expected video URL');
        console.log('Expected to contain: cmezholcd0001gken4tscxbnu');
        console.log('Actual URL:', recording.url);
      }
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


  } catch (error) {
    console.error('❌ Error checking video analysis:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSpecificVideoAnalysis();
