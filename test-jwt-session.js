// Test script to verify JWT session handling with video analysis API
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');
// Import fetch properly for Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

// Helper function to generate a JWT token (simplified version for testing)
function generateTestToken(email, userId) {
  const payload = {
    email,
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
  };
  
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function testJwtSessionWithVideoAnalysis() {
  try {
    console.log('🔍 Testing JWT session handling with video analysis API...');
    
    // 1. Get a test user from the database
    const user = await prisma.user.findFirst({
      where: {
        role: 'INTERVIEWEE'
      }
    });
    
    if (!user) {
      console.error('❌ No test user found in database');
      return;
    }
    
    console.log(`✅ Found test user: ${user.email} (${user.id})`);
    
    // 2. Get a completed interview session with recording for this user
    const session = await prisma.interviewSession.findFirst({
      where: {
        intervieweeId: user.id,
        status: 'COMPLETED',
        recording: {
          isNot: null
        }
      },
      include: {
        recording: true
      }
    });
    
    if (!session) {
      console.error('❌ No completed interview session found with video URI');
      return;
    }
    
    console.log(`✅ Found interview session: ${session.id}`);
    console.log(`   Recording URL: ${session.recording?.url}`);
    
    // 3. Check if video analysis exists for this session
    const existingAnalysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: user.id
        }
      }
    });
    
    console.log(`📊 Existing video analysis: ${existingAnalysis ? 'YES' : 'NO'}`);
    
    // 4. Generate a test JWT token for authentication
    const testToken = generateTestToken(user.email, user.id);
    console.log('🔑 Generated test JWT token');
    
    // 5. Create a cookie string that mimics the next-auth.session-token
    const cookieValue = `next-auth.session-token=${testToken}`;
    
    // 6. Call the video analysis API with the JWT session token
    console.log('🚀 Calling video analysis API with JWT session token...');
    // Use hardcoded localhost:3000 to ensure correct port
    const apiBaseUrl = 'http://localhost:3000';
    const response = await fetch(`${apiBaseUrl}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieValue,
        'X-Session-ID': session.id,
        'X-Auth-Method': 'jwt-session'
      },
      body: JSON.stringify({
        videoUri: session.recording.url,
        sessionId: session.id,
        analysisType: 'comprehensive'
      })
    });
    
    // 7. Check the response
    if (response.ok) {
      console.log('✅ API call successful!');
      const result = await response.json();
      console.log('📝 Response summary:');
      console.log(`   - Face detection: ${result.faceDetection?.detected ? 'YES' : 'NO'}`);
      console.log(`   - Speech recognition: ${result.speechRecognition?.transcript ? 'YES' : 'NO'}`);
      console.log(`   - Overall confidence: ${result.confidence?.toFixed(2) || 'N/A'}`);
    } else {
      console.error(`❌ API call failed with status: ${response.status}`);
      const errorText = await response.text();
      console.error(`   Error: ${errorText}`);
      
      // 8. Fallback to API key authentication if JWT fails
      console.log('🔑 Falling back to API key authentication...');
      const apiKeyResponse = await fetch(`http://localhost:3000/api/video-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET_KEY,
          'X-Session-ID': session.id
        },
        body: JSON.stringify({
          videoUri: session.recording.url,
          sessionId: session.id,
          analysisType: 'comprehensive'
        })
      });
      
      if (apiKeyResponse.ok) {
        console.log('✅ API key authentication successful!');
        const apiKeyResult = await apiKeyResponse.json();
        console.log('📝 Response summary:');
        console.log(`   - Face detection: ${apiKeyResult.faceDetection?.detected ? 'YES' : 'NO'}`);
        console.log(`   - Speech recognition: ${apiKeyResult.speechRecognition?.transcript ? 'YES' : 'NO'}`);
        console.log(`   - Overall confidence: ${apiKeyResult.confidence?.toFixed(2) || 'N/A'}`);
      } else {
        console.error(`❌ API key authentication also failed with status: ${apiKeyResponse.status}`);
        const apiKeyErrorText = await apiKeyResponse.text();
        console.error(`   Error: ${apiKeyErrorText}`);
      }
    }
    
    // 9. Check if video analysis was stored in the database
    const updatedAnalysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId: user.id
        }
      }
    });
    
    if (updatedAnalysis && (!existingAnalysis || updatedAnalysis.updatedAt > existingAnalysis.updatedAt)) {
      console.log('✅ Video analysis successfully stored/updated in database');
    } else if (updatedAnalysis) {
      console.log('ℹ️ Video analysis exists but was not updated');
    } else {
      console.log('❌ Video analysis was not stored in database');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testJwtSessionWithVideoAnalysis();
