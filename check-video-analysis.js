require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkVideoAnalysis() {
  try {
    const sessionId = 'cmeykoe1i0001xfcbvg4mu7sk';
    
    // Check if session exists
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        recording: true,
        feedback: true
      }
    });
    
    if (!session) {
      console.log('❌ Session not found:', sessionId);
      return;
    }
    
    console.log('✅ Session found:', {
      id: session.id,
      status: session.status,
      type: session.type,
      isConversational: session.isConversational,
      createdAt: session.createdAt,
      hasRecording: !!session.recording,
      hasFeedback: !!session.feedback
    });
    
    // Check for video analysis separately
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: { 
        sessionId: sessionId,
        userId: session.intervieweeId
      }
    });
    
    if (videoAnalysis) {
      console.log('✅ Video analysis found:', {
        id: videoAnalysis.id,
        createdAt: videoAnalysis.createdAt,
        updatedAt: videoAnalysis.updatedAt,
        hasResults: !!videoAnalysis.results
      });
      
      if (videoAnalysis.results) {
        const results = JSON.parse(videoAnalysis.results);
        console.log('📊 Analysis results summary:', {
          hasVideoAnalysis: !!results.videoAnalysis,
          timestamp: results.videoAnalysis?.timestamp
        });
      }
    } else {
      console.log('❌ No video analysis found for this session');
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error checking video analysis:', error.message);
    await prisma.$disconnect();
  }
}

checkVideoAnalysis();
