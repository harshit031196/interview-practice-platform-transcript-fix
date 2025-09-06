const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkSessionAnalysis() {
  const sessionId = 'cmey2xwv80001z9vs36dnmn72';
  
  try {
    console.log('🔍 Checking session and analysis data for:', sessionId);
    
    // Check if session exists
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: { email: true, name: true }
        }
      }
    });
    
    if (!session) {
      console.log('❌ Session not found in database');
      return;
    }
    
    console.log('✅ Session found:');
    console.log('   User:', session.user?.email || 'Unknown');
    console.log('   Status:', session.status);
    console.log('   Created:', session.createdAt);
    console.log('   Updated:', session.updatedAt);
    console.log('   Type:', session.interviewType);
    console.log('   Duration:', session.duration, 'minutes');
    
    // Check for video analysis results
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: {
        sessionId: sessionId,
        userId: session.userId
      }
    });
    
    if (videoAnalysis) {
      console.log('\n✅ Video analysis found:');
      console.log('   Created:', videoAnalysis.createdAt);
      console.log('   Updated:', videoAnalysis.updatedAt);
      
      // Parse and check results
      try {
        const results = JSON.parse(videoAnalysis.results);
        console.log('   Has Face Detection:', !!results.videoAnalysis?.faceDetection?.detected);
        console.log('   Has Speech Transcription:', !!results.videoAnalysis?.speechTranscription?.hasAudio);
        console.log('   Overall Confidence:', results.videoAnalysis?.confidence || 'N/A');
        console.log('   Audio Processing Method:', results.videoAnalysis?.audioProcessingMethod || 'N/A');
        
        if (results.videoAnalysis?.speechTranscription?.transcript) {
          console.log('   Transcript Preview:', results.videoAnalysis.speechTranscription.transcript.substring(0, 100) + '...');
        }
      } catch (parseError) {
        console.log('   ⚠️ Error parsing analysis results:', parseError.message);
      }
    } else {
      console.log('\n❌ No video analysis found for this session');
      console.log('   This explains why the API call wasn\'t triggered or failed');
    }
    
    // Check for any conversational feedback
    const conversationalData = await prisma.conversationalFeedback.findFirst({
      where: {
        sessionId: sessionId,
        userId: session.userId
      }
    });
    
    if (conversationalData) {
      console.log('\n✅ Conversational feedback found');
    } else {
      console.log('\n❌ No conversational feedback found');
    }
    
  } catch (error) {
    console.error('💥 Error checking session:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSessionAnalysis();
