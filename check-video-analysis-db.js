require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkVideoAnalysis() {
  const sessionId = 'cmey0g7vy00018t6304kxivgy';
  
  try {
    console.log('🔍 Checking database for video analysis results...');
    console.log('Session ID:', sessionId);
    
    // Check if any video analysis exists for this session
    const analysisResults = await prisma.videoAnalysis.findMany({
      where: {
        sessionId: sessionId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (analysisResults.length === 0) {
      console.log('❌ No video analysis found in database for this session');
      
      // Check if the session exists
      const session = await prisma.aiSession.findUnique({
        where: { id: sessionId }
      });
      
      if (session) {
        console.log('✅ Session exists in database:', {
          id: session.id,
          status: session.status,
          createdAt: session.createdAt,
          userId: session.userId
        });
      } else {
        console.log('❌ Session not found in database');
      }
      
    } else {
      console.log(`✅ Found ${analysisResults.length} video analysis result(s):`);
      
      analysisResults.forEach((result, index) => {
        console.log(`\n📊 Analysis ${index + 1}:`);
        console.log('- ID:', result.id);
        console.log('- Created:', result.createdAt);
        console.log('- Updated:', result.updatedAt);
        console.log('- User ID:', result.userId);
        
        try {
          const parsedResults = JSON.parse(result.results);
          console.log('- Analysis Summary:');
          
          if (parsedResults.videoAnalysis) {
            const va = parsedResults.videoAnalysis;
            console.log(`  • Face Detection: ${va.faceDetection?.detected ? 'Yes' : 'No'}`);
            console.log(`  • Speech Transcription: ${va.speechTranscription?.hasAudio ? 'Yes' : 'No'}`);
            console.log(`  • Person Detection: ${va.personDetection?.detected ? 'Yes' : 'No'}`);
            console.log(`  • Overall Confidence: ${va.confidence || 'N/A'}`);
            
            if (va.speechTranscription?.transcript) {
              console.log(`  • Transcript: "${va.speechTranscription.transcript.substring(0, 100)}..."`);
            }
          }
        } catch (e) {
          console.log('- Raw Results:', result.results.substring(0, 200) + '...');
        }
      });
    }
    
  } catch (error) {
    console.error('💥 Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkVideoAnalysis();
