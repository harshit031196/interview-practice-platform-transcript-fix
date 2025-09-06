// Debug why video analysis isn't showing up in the database
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugAnalysisStorage() {
  try {
    const sessionId = 'cmey5ghed0007lmf599bx19gg';
    
    console.log('🔍 Debugging video analysis storage for session:', sessionId);
    
    // 1. Check session details
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        recording: true,
        feedback: true,
        interviewee: true
      }
    });
    
    if (!session) {
      console.log('❌ Session not found');
      return;
    }
    
    console.log('\n📋 Session Details:');
    console.log('  ID:', session.id);
    console.log('  Status:', session.status);
    console.log('  Interviewee ID:', session.intervieweeId);
    console.log('  Recording URL:', session.recording?.url);
    
    // 2. Check all video analysis records for this session (any user)
    const allAnalyses = await prisma.videoAnalysis.findMany({
      where: { sessionId: sessionId }
    });
    
    console.log('\n🔍 Video Analysis Records (all users):');
    if (allAnalyses.length === 0) {
      console.log('  ❌ No video analysis records found for this session');
    } else {
      allAnalyses.forEach((analysis, index) => {
        console.log(`  ${index + 1}. Analysis ID: ${analysis.id}`);
        console.log(`     User ID: ${analysis.userId}`);
        console.log(`     Session ID: ${analysis.sessionId}`);
        console.log(`     Created: ${analysis.createdAt}`);
        console.log(`     Has Results: ${!!analysis.results}`);
        
        if (analysis.results) {
          try {
            const results = JSON.parse(analysis.results);
            console.log(`     Analysis Type: ${results.videoAnalysis ? 'Video Intelligence' : 'Unknown'}`);
            console.log(`     Confidence: ${results.videoAnalysis?.confidence || 'N/A'}`);
          } catch (e) {
            console.log(`     Results parsing error: ${e.message}`);
          }
        }
        console.log('');
      });
    }
    
    // 3. Check if there's a mismatch between session.intervieweeId and analysis.userId
    if (allAnalyses.length > 0) {
      const mismatchedAnalyses = allAnalyses.filter(a => a.userId !== session.intervieweeId);
      if (mismatchedAnalyses.length > 0) {
        console.log('⚠️  Found video analyses with mismatched user IDs:');
        mismatchedAnalyses.forEach(analysis => {
          console.log(`   Analysis User ID: ${analysis.userId}`);
          console.log(`   Session Interviewee ID: ${session.intervieweeId}`);
        });
      }
    }
    
    // 4. Check recent video analysis records (last 24 hours)
    const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAnalyses = await prisma.videoAnalysis.findMany({
      where: {
        createdAt: { gte: recent }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log('\n📅 Recent Video Analysis Records (last 24h):');
    if (recentAnalyses.length === 0) {
      console.log('  ❌ No recent video analysis records found');
    } else {
      recentAnalyses.forEach((analysis, index) => {
        console.log(`  ${index + 1}. Session: ${analysis.sessionId}`);
        console.log(`     User: ${analysis.userId}`);
        console.log(`     Created: ${analysis.createdAt}`);
        console.log('');
      });
    }
    
    // 5. Test the API endpoint that the frontend uses
    console.log('\n🌐 Testing frontend API endpoint...');
    try {
      const apiResponse = await fetch(`http://localhost:3000/api/video-analysis/results/${sessionId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`API Response Status: ${apiResponse.status}`);
      
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        console.log('API Response Data:', JSON.stringify(apiData, null, 2));
      } else {
        const errorText = await apiResponse.text();
        console.log('API Error:', errorText);
      }
    } catch (apiError) {
      console.log('API Request Failed:', apiError.message);
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Debug error:', error.message);
    await prisma.$disconnect();
  }
}

debugAnalysisStorage();
