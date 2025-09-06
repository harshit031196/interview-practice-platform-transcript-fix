const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function checkRecentSessions() {
  try {
    console.log('🔍 Checking recent interview sessions...');
    
    // Get the most recent sessions (last 10)
    const recentSessions = await prisma.interviewSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
            include: {
        interviewee: {
          select: { email: true, id: true }
        }
      }
    });
    
    if (recentSessions.length === 0) {
      console.log('❌ No sessions found');
      return;
    }
    
    console.log(`✅ Found ${recentSessions.length} recent sessions:\n`);
    
    for (const session of recentSessions) {
      console.log(`📋 Session: ${session.id}`);
            console.log(`   User: ${session.interviewee?.email || 'Unknown'} (ID: ${session.interviewee?.id})`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Type: ${session.interviewType}`);
      console.log(`   Conversational: ${session.isConversational || false}`);
      
      // Check for video analysis
      const videoAnalysis = await prisma.videoAnalysis.findFirst({
        where: { sessionId: session.id }
      });
      
      console.log(`   Video Analysis: ${videoAnalysis ? '✅ Found' : '❌ Missing'}`);
      
      // Check for interview feedback
      const interviewFeedback = await prisma.interviewFeedback.findFirst({
        where: { sessionId: session.id }
      });
      
      console.log(`   Interview Feedback: ${interviewFeedback ? '✅ Found' : '❌ Missing'}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentSessions();
