// Script to check session upload status
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSessionUpload() {
  try {
    const sessionId = 'cmexzlgvg0001qixuas2p04vt';
    console.log(`🔍 Checking session: ${sessionId}`);
    
    // Check session details
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId }
    });
    
    if (!session) {
      console.log('❌ Session not found');
      return;
    }
    
    console.log('✅ Session found:', {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      userId: session.intervieweeId,
      isConversational: session.isConversational,
      duration: session.duration
    });
    
    // Check for recordings
    const recordings = await prisma.recording.findMany({
      where: { sessionId: sessionId }
    });
    
    console.log(`📹 Found ${recordings.length} recordings:`);
    recordings.forEach((recording, index) => {
      console.log(`  Recording ${index + 1}:`, {
        id: recording.id,
        filePath: recording.filePath,
        createdAt: recording.createdAt
      });
    });
    
    // Check for video analysis
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: { sessionId: sessionId }
    });
    
    if (videoAnalysis) {
      console.log('✅ Video analysis found:', {
        id: videoAnalysis.id,
        createdAt: videoAnalysis.createdAt,
        hasResults: !!videoAnalysis.results
      });
    } else {
      console.log('⚠️  No video analysis found');
    }
    
    // Check for interview feedback
    const feedback = await prisma.interviewFeedback.findFirst({
      where: { sessionId: sessionId }
    });
    
    if (feedback) {
      console.log('✅ Interview feedback found:', {
        id: feedback.id,
        createdAt: feedback.createdAt,
        hasTranscript: !!feedback.transcript
      });
    } else {
      console.log('⚠️  No interview feedback found');
    }
    
    console.log('\n📊 Session Upload Status Summary:');
    console.log(`- Session exists: ✅`);
    console.log(`- Recordings: ${recordings.length > 0 ? '✅' : '❌'} (${recordings.length} found)`);
    console.log(`- Video analysis: ${videoAnalysis ? '✅' : '❌'}`);
    console.log(`- Interview feedback: ${feedback ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkSessionUpload().catch(console.error);
