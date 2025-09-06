// Test script to directly test the video analysis API with a valid video URI
require('dotenv').config({ path: '.env.local' });
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration
const API_URL = 'http://localhost:3001/api/video-analysis';
const API_KEY = process.env.API_KEY;
const TEST_SESSION_ID = 'cmey7ql0v000911zba3x6s4ec'; // Use an existing session ID
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey7ql0v000911zba3x6s4ec/1756555450302_interview_cmey7ql0v000911zba3x6s4ec_1756555449782.webm';

// Test POST endpoint with API key authentication
async function testVideoAnalysisPost() {
  console.log('\n🔍 Testing POST /api/video-analysis endpoint with direct GCS URI...');
  
  try {
    // Use API key authentication
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': process.env.API_KEY
    };
    
    console.log('Using API key for authentication');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        videoUri: TEST_VIDEO_URI
      })
    });
    
    const result = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ POST request successful');
      return result;
    } else {
      console.log('❌ POST request failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error making POST request:', error);
    return null;
  }
}

// Main test function
async function runTest() {
  console.log('🚀 Starting video analysis API test with direct GCS URI');
  
  // Test POST endpoint
  const postResult = await testVideoAnalysisPost();
  
  if (postResult) {
    console.log('\n⏳ Waiting 10 seconds for analysis to start processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('\n📊 Test Summary:');
    console.log('- POST request:', postResult ? '✅ Success' : '❌ Failed');
  }
}

// Run the test
runTest();
