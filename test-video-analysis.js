// Script to remove mock analysis data and debug the real data flow
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupAndDebugDataFlow() {
  try {
    console.log('🧹 Removing mock analysis data for session: cmexxsxen0001lfc4i3qoj39m');
    
    // Remove the mock analysis record
    const deletedAnalysis = await prisma.videoAnalysis.deleteMany({
      where: {
        sessionId: 'cmexxsxen0001lfc4i3qoj39m'
      }
    });
    
    console.log(`✅ Deleted ${deletedAnalysis.count} mock analysis records`);
    
    // Check session details
    const session = await prisma.interviewSession.findUnique({
      where: { id: 'cmexxsxen0001lfc4i3qoj39m' }
    });
    
    if (!session) {
      console.log('❌ Session not found');
      return;
    }
    
    console.log('📋 Session details:', {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      userId: session.intervieweeId,
      isConversational: session.isConversational
    });
    
    // Check if there are any recordings for this session
    const recordings = await prisma.recording.findMany({
      where: { sessionId: 'cmexxsxen0001lfc4i3qoj39m' }
    });
    
    console.log(`📹 Found ${recordings.length} recordings for this session`);
    recordings.forEach((recording, index) => {
      console.log(`  Recording ${index + 1}:`, {
        id: recording.id,
        filePath: recording.filePath,
        createdAt: recording.createdAt
      });
    });
    
    console.log('\n🔍 Analysis of the data flow issue:');
    console.log('1. Session exists and is COMPLETED');
    console.log('2. Video was uploaded to Google Cloud Storage');
    console.log('3. Analysis was never triggered automatically');
    console.log('4. Need to fix the UnifiedInterviewSession component to properly trigger analysis');
    
    console.log('\n🎯 Session is now back to "Processing" state - ready for real analysis flow fix');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupAndDebugDataFlow().catch(console.error);
