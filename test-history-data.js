const { PrismaClient } = require('@prisma/client');

async function testHistoryData() {
  const prisma = new PrismaClient();
  
  try {
    // Fetch interview sessions
    const sessions = await prisma.interviewSession.findMany({
      where: {
        intervieweeId: 'cmevrzxmg0000t89tltjkj6ou'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`\n📊 Found ${sessions.length} interview sessions`);
    
    // Fetch video analysis data for each session
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      console.log(`\n${i + 1}. Session: ${session.id}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log(`   Type: ${session.type}`);
      
      // Look for video analysis data
      const videoAnalysis = await prisma.videoAnalysis.findFirst({
        where: {
          sessionId: session.id,
          userId: 'cmevrzxmg0000t89tltjkj6ou'
        }
      });
      
      if (videoAnalysis) {
        const results = JSON.parse(videoAnalysis.results);
        
        console.log(`   ✅ Analysis Available:`);
        console.log(`      - Overall Score: ${results.overall_score?.overall_score || 'N/A'}`);
        console.log(`      - Grade: ${results.overall_score?.grade || 'N/A'}`);
        console.log(`      - Speech Analysis: ${results.speech_analysis ? '✓' : '✗'}`);
        console.log(`      - Facial Analysis: ${results.facial_analysis ? '✓' : '✗'}`);
        console.log(`      - Confidence Analysis: ${results.confidence_analysis ? '✓' : '✗'}`);
        if (results.speech_analysis?.transcript) {
          console.log(`      - Transcript Preview: "${results.speech_analysis.transcript.substring(0, 50)}..."`);
        }
      } else {
        console.log(`   ❌ No Analysis Data`);
      }
    }

  } catch (error) {
    console.error('❌ Error fetching history data:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testHistoryData();
