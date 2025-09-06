// Script to check the latest interview session upload status
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLatestSession() {
  try {
    console.log('🔍 Checking specific session: cmey14caz00078t639l6iusgn');
    
    // Check the specific session from the video URL
    const sessionId = 'cmey14caz00078t639l6iusgn';
    const latestSession = await prisma.interviewSession.findUnique({
      where: {
        id: sessionId
      },
      include: {
        recording: true
      }
    });
    
    if (!latestSession) {
      console.log('❌ No sessions found');
      return;
    }
    
    console.log('✅ Latest session found:', {
      id: latestSession.id,
      status: latestSession.status,
      createdAt: latestSession.createdAt,
      endedAt: latestSession.endedAt,
      isConversational: latestSession.isConversational,
      duration: latestSession.duration
    });
    
    // Check recording
    if (latestSession.recording) {
      console.log('✅ Recording found:', {
        id: latestSession.recording.id,
        url: latestSession.recording.url,
        durationSec: latestSession.recording.durationSec,
        consent: latestSession.recording.consent
      });
    } else {
      console.log('❌ No recording found in database');
    }
    
    // Check for video analysis
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: { sessionId: latestSession.id },
      orderBy: { createdAt: 'desc' }
    });
    
    if (videoAnalysis) {
      console.log('✅ Video analysis found:', {
        id: videoAnalysis.id,
        createdAt: videoAnalysis.createdAt,
        hasResults: !!videoAnalysis.results
      });
    } else {
      console.log('⚠️  No video analysis found yet');
    }
    
    // Check for interview feedback
    const feedback = await prisma.interviewFeedback.findFirst({
      where: { sessionId: latestSession.id },
      orderBy: { createdAt: 'desc' }
    });
    
    if (feedback) {
      console.log('✅ Interview feedback found:', {
        id: feedback.id,
        createdAt: feedback.createdAt,
        hasTranscript: !!feedback.transcript
      });
    } else {
      console.log('⚠️  No interview feedback found yet');
    }
    
    console.log('\n📊 Upload Status Summary:');
    console.log(`- Session: ✅ ${latestSession.id}`);
    console.log(`- Recording: ${latestSession.recording ? '✅' : '❌'}`);
    console.log(`- Video Analysis: ${videoAnalysis ? '✅' : '⚠️  Pending'}`);
    console.log(`- Interview Feedback: ${feedback ? '✅' : '⚠️  Pending'}`);
    
    // If there's a recording, check if it exists in Google Cloud Storage
    if (latestSession.recording) {
      console.log('\n🔍 Checking Google Cloud Storage...');
      const gsPath = latestSession.recording.url.replace('gs://wingman-interview-videos-harshit-2024/', '');
      console.log(`File path: ${gsPath}`);
      console.log(`Full GS URI: ${latestSession.recording.url}`);
    }
    
    return latestSession.id;
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkLatestSession().catch(console.error);
