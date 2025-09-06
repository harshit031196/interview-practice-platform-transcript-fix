require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sessionId = process.argv[2] || 'cmezfh6en000z12vec1su10if';
const userId = 'cmezelnx5000057j9br3cf1y9';

async function checkSession() {
  console.log('🔍 Checking Session and Video Analysis');
  console.log('=====================================');
  console.log(`Session ID: ${sessionId}`);
  console.log(`User ID: ${userId}`);
  
  try {
    // Check interview session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });
    
    if (!session) {
      console.log('❌ Interview session not found in database');
      return;
    }
    
    console.log('\n📝 Interview Session Details:');
    console.log('---------------------------');
    console.log(`Status: ${session.status}`);
    console.log(`Created: ${session.createdAt}`);
    console.log(`Updated: ${session.updatedAt}`);
    console.log(`Video URI: ${session.videoUri || 'Not set'}`);
    
    // Check video analysis
    const analysis = await prisma.videoAnalysis.findFirst({
      where: { sessionId },
    });
    
    if (!analysis) {
      console.log('\n❌ No video analysis found for this session');
      return;
    }
    
    console.log('\n🎥 Video Analysis Details:');
    console.log('------------------------');
    console.log(`Status: ${analysis.status}`);
    console.log(`Created: ${analysis.createdAt}`);
    console.log(`Updated: ${analysis.updatedAt}`);
    console.log(`Has Results: ${analysis.results ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error('Error checking session:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSession();
