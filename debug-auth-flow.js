const fetch = require('node-fetch');

async function debugAuthFlow() {
  console.log('🔍 Debugging Authentication Flow\n');
  
  const sessionId = 'cmey0g7vy00018t6304kxivgy';
  const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey0g7vy00018t6304kxivgy/1756543213031_interview_cmey0g7vy00018t6304kxivgy_1756543212585.webm';
  
  console.log('📋 Test Details:');
  console.log('- Session ID:', sessionId);
  console.log('- Video URI:', videoUri);
  console.log('- Video Location: Google Cloud Storage');
  console.log('- Expected Analysis: Face detection, speech transcription, person detection\n');
  
  try {
    // Test 1: Check NextAuth session endpoint
    console.log('1️⃣ Testing NextAuth session endpoint...');
    const sessionResponse = await fetch('http://localhost:3000/api/auth/session', {
      credentials: 'include'
    });
    
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('✅ Session endpoint accessible');
      console.log('Session data:', JSON.stringify(sessionData, null, 2));
    } else {
      console.log('❌ Session endpoint failed:', sessionResponse.status);
      const errorText = await sessionResponse.text();
      console.log('Error:', errorText);
    }
    
    // Test 2: Check if session exists in browser context
    console.log('\n2️⃣ Testing session authentication...');
    const testAuthResponse = await fetch('http://localhost:3000/api/ai/session/' + sessionId, {
      credentials: 'include'
    });
    
    if (testAuthResponse.ok) {
      const authData = await testAuthResponse.json();
      console.log('✅ Session authentication working');
      console.log('Auth data:', JSON.stringify(authData, null, 2));
    } else {
      console.log('❌ Session authentication failed:', testAuthResponse.status);
      const errorText = await testAuthResponse.text();
      console.log('Error:', errorText);
    }
    
    // Test 3: Test video analysis API with detailed logging
    console.log('\n3️⃣ Testing video analysis API...');
    console.log('Request payload:');
    const payload = {
      videoUri: videoUri,
      sessionId: sessionId,
      analysisType: 'comprehensive'
    };
    console.log(JSON.stringify(payload, null, 2));
    
    const analysisResponse = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    
    console.log('Response status:', analysisResponse.status);
    console.log('Response headers:', Object.fromEntries(analysisResponse.headers.entries()));
    
    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      console.log('✅ Video analysis successful!');
      console.log('Analysis data:', JSON.stringify(analysisData, null, 2));
    } else {
      const errorText = await analysisResponse.text();
      console.log('❌ Video analysis failed');
      console.log('Error response:', errorText);
      
      // Additional debugging for 401 errors
      if (analysisResponse.status === 401) {
        console.log('\n🔍 401 Unauthorized Analysis:');
        console.log('- This indicates NextAuth session validation failed');
        console.log('- Check if NEXTAUTH_SECRET is properly set');
        console.log('- Verify session cookies are being sent');
        console.log('- Ensure user is properly authenticated');
      }
    }
    
    // Test 4: Check video URI accessibility
    console.log('\n4️⃣ Checking video URI format and accessibility...');
    console.log('Video URI format analysis:');
    console.log('- Protocol: gs:// (Google Cloud Storage)');
    console.log('- Bucket: wingman-interview-videos-harshit-2024');
    console.log('- Path: interviews/[userId]/[sessionId]/[filename]');
    console.log('- File format: .webm (supported by Video Intelligence API)');
    
    if (videoUri.startsWith('gs://')) {
      console.log('✅ Video URI format is correct for Google Cloud Storage');
    } else {
      console.log('❌ Video URI format is incorrect');
    }
    
  } catch (error) {
    console.error('💥 Debug script error:', error);
  }
}

debugAuthFlow();
