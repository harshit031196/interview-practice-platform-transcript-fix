// Test script for end-to-end video analysis flow
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration
const API_URL = 'http://localhost:3000/api/video-analysis';
const TEST_VIDEO_URI = 'https://storage.cloud.google.com/wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey7ql0v000911zba3x6s4ec/1756555450302_interview_cmey7ql0v000911zba3x6s4ec_1756555449782.webm';
const TEST_SESSION_ID = uuidv4(); // Generate a random session ID for testing
const API_SECRET_KEY = process.env.API_SECRET_KEY || ''; // Get API key from environment variables

// Helper function to create a test JWT token
async function createTestJwtSession() {
  console.log('Creating test user and session...');
  
  // Create a test user if it doesn't exist
  const testUser = await prisma.user.upsert({
    where: { email: 'test-video-analysis@example.com' },
    update: {},
    create: {
      email: 'test-video-analysis@example.com',
      name: 'Test Video Analysis User',
      role: 'INTERVIEWEE', // Using correct enum value from schema
    }
  });
  
  console.log(`Test user created/found with ID: ${testUser.id}`);
  
  // Create a test session
  const session = await prisma.session.create({
    data: {
      sessionToken: `test-token-${Date.now()}`,
      userId: testUser.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    }
  });
  
  console.log(`Test session created with token: ${session.sessionToken}`);
  
  // Create a test interview session
  const interviewSession = await prisma.interviewSession.create({
    data: {
      id: TEST_SESSION_ID,
      status: 'COMPLETED',
      duration: 120,
      type: 'AI', // Using the correct SessionType enum value
      difficulty: 'MEDIUM',
      intervieweeId: testUser.id, // Required field linking to the user
      interviewType: 'behavioral',
    }
  });
  
  console.log(`Test interview session created with ID: ${interviewSession.id}`);
  
  // Create a recording entry with the video URL
  const recording = await prisma.recording.create({
    data: {
      sessionId: TEST_SESSION_ID,
      url: TEST_VIDEO_URI,
      durationSec: 120,
      consent: true
    }
  });
  
  console.log(`Test recording created with URL: ${recording.url}`);
  
  return {
    sessionToken: session.sessionToken,
    userId: testUser.id,
    sessionId: TEST_SESSION_ID
  };
}

// Test POST endpoint with session token authentication
async function testVideoAnalysisPost(sessionToken) {
  console.log('\n🔍 Testing POST /api/video-analysis endpoint with session authentication...');
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${sessionToken}`
      },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        videoUri: TEST_VIDEO_URI
      })
    });
    
    const result = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ POST request with session authentication successful');
      return result;
    } else {
      console.log('❌ POST request with session authentication failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error making POST request with session authentication:', error);
    return null;
  }
}

// Test POST endpoint with API key authentication
async function testVideoAnalysisPostWithApiKey() {
  console.log('\n🔍 Testing POST /api/video-analysis endpoint with API key authentication...');
  
  if (!API_SECRET_KEY) {
    console.log('❌ API_SECRET_KEY not found in environment variables');
    return null;
  }
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_SECRET_KEY}`
      },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        videoUri: TEST_VIDEO_URI
      })
    });
    
    const result = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (response.ok) {
      console.log('✅ POST request with API key authentication successful');
      return result;
    } else {
      console.log('❌ POST request with API key authentication failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Error making POST request with API key authentication:', error);
    return null;
  }
}

// Test GET endpoint with session token authentication
async function testVideoAnalysisGet(sessionToken, analysisId) {
  console.log('\n🔍 Testing GET /api/video-analysis endpoint...');
  
  try {
    const response = await fetch(`${API_URL}?analysisId=${analysisId}`, {
      method: 'GET',
      headers: {
        'Cookie': `next-auth.session-token=${sessionToken}`,
        'Cache-Control': 'no-cache'
      }
    });
    
    console.log(`Status: ${response.status}`);
    const data = await response.json();
    console.log('Response:', data);
    
    return response.ok;
  } catch (error) {
    console.error('GET request error:', error);
    return false;
  }
}

// Check video analysis results in database
async function checkVideoAnalysisInDb(sessionId) {
  console.log('\n🔍 Checking video analysis in database...');
  
  try {
    const analysis = await prisma.videoAnalysis.findFirst({
      where: { sessionId }
    });
    
    if (analysis) {
      console.log('✅ Video analysis found in database');
      console.log('Analysis ID:', analysis.id);
      console.log('Created at:', analysis.createdAt);
      console.log('Updated at:', analysis.updatedAt);
      console.log('Has face data:', !!analysis.faceData);
      console.log('Has speech data:', !!analysis.speechData);
      console.log('Has person data:', !!analysis.personData);
      console.log('Has text data:', !!analysis.textData);
      return analysis;
    } else {
      console.log('❌ No video analysis found in database');
      return null;
    }
  } catch (error) {
    console.error('❌ Error checking database:', error);
    return null;
  }
}

// Main test function
async function runEndToEndTest() {
  try {
    console.log('🚀 Starting end-to-end video analysis test');
    
    // Step 1: Create test user and session
    console.log('Creating test user and session...');
    const { sessionToken, userId, sessionId } = await createTestJwtSession();
    
    // Step 2: Wait a bit to ensure session is properly created
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 3: Test POST endpoint with session token
    const postResult = await testVideoAnalysisPost(sessionToken);
    
    // Step 4: Wait for analysis to be processed
    console.log('\n⏳ Waiting 10 seconds for analysis to start processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Step 5: Check database for video analysis results
    const dbResult = await checkVideoAnalysisInDb(sessionId);
    
    // Step 6: Test GET endpoint with session token and analysisId
    let getResult = false;
    if (dbResult && dbResult.id) {
      getResult = await testVideoAnalysisGet(sessionToken, dbResult.id);
    } else {
      console.log('❌ Cannot test GET endpoint - no analysis ID found');
    }
    
    // Step 7: Summary
    console.log('\n📊 Test Summary:');
    console.log(`- POST request: ${postResult ? '✅ Success' : '❌ Failed'}`);
    console.log(`- GET request: ${getResult ? '✅ Success' : '❌ Failed'}`);
    console.log(`- Database record: ${dbResult ? '✅ Found' : '❌ Not found'}`);
    
    console.log('\n🎉 End-to-end test completed successfully!');
  } catch (error) {
    console.log(`\n❌ Test failed with error: ${error}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
runEndToEndTest();
