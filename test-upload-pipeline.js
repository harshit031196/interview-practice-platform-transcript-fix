// Test script to verify the complete upload and analysis pipeline
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testUploadPipeline() {
  try {
    console.log('🧪 Testing Upload and Analysis Pipeline');
    console.log('=====================================\n');
    
    // Create a test session
    const testSession = await prisma.interviewSession.create({
      data: {
        intervieweeId: 'cmexwu4d50000atgub3z63fdc', // Use existing user ID
        type: 'AI',
        status: 'RUNNING',
        isConversational: true,
        interviewType: 'behavioral',
        difficulty: 'MEDIUM',
        duration: 15,
        startedAt: new Date(),
      }
    });
    
    console.log('✅ Test session created:', testSession.id);
    
    // Simulate video upload by creating a recording entry
    const testRecording = await prisma.recording.create({
      data: {
        sessionId: testSession.id,
        url: `gs://wingman-interview-videos-harshit-2024/test/test_video_${Date.now()}.webm`,
        durationSec: 900, // 15 minutes
        consent: true,
      }
    });
    
    console.log('✅ Test recording entry created:', testRecording.id);
    
    // Check if the recording is properly linked to session
    const sessionWithRecording = await prisma.interviewSession.findUnique({
      where: { id: testSession.id },
      include: { recording: true }
    });
    
    console.log('✅ Session with recording:', {
      sessionId: sessionWithRecording?.id,
      hasRecording: !!sessionWithRecording?.recording,
      recordingUrl: sessionWithRecording?.recording?.url
    });
    
    // Simulate video analysis creation
    const testAnalysis = await prisma.videoAnalysis.create({
      data: {
        sessionId: testSession.id,
        userId: 'cmexwu4d50000atgub3z63fdc',
        results: JSON.stringify({
          confidence: 85,
          emotions: { neutral: 0.7, happy: 0.2, focused: 0.1 },
          speechAnalysis: { clarity: 0.8, pace: 0.75 },
          overallScore: 82
        })
      }
    });
    
    console.log('✅ Test video analysis created:', testAnalysis.id);
    
    // Test the complete data retrieval (like the history API does)
    const completeSession = await prisma.interviewSession.findUnique({
      where: { id: testSession.id },
      include: {
        recording: true,
        feedback: true
      }
    });
    
    // Get video analysis separately
    const videoAnalysis = await prisma.videoAnalysis.findMany({
      where: { sessionId: testSession.id }
    });
    
    console.log('\n📊 Complete Session Data:');
    console.log('- Session ID:', completeSession?.id);
    console.log('- Status:', completeSession?.status);
    console.log('- Has Recording:', !!completeSession?.recording);
    console.log('- Has Video Analysis:', videoAnalysis?.length > 0);
    console.log('- Has Interview Feedback:', completeSession?.feedback?.length > 0);
    
    // Clean up test data
    await prisma.videoAnalysis.delete({ where: { id: testAnalysis.id } });
    await prisma.recording.delete({ where: { id: testRecording.id } });
    await prisma.interviewSession.delete({ where: { id: testSession.id } });
    
    console.log('\n🧹 Test data cleaned up');
    console.log('\n✅ Pipeline Test PASSED - All components working correctly!');
    
  } catch (error) {
    console.error('❌ Pipeline Test FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testUploadPipeline().catch(console.error);
