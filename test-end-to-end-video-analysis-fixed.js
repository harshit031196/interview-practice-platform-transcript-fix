// End-to-end test script for video analysis API with proper Recording model
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Initialize Prisma client
const prisma = new PrismaClient();

// Configuration
const API_URL = 'http://localhost:3001/api/video-analysis';
const API_KEY = process.env.API_KEY;
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/interviews/test/sample-video.webm';

// Test data
const testUser = {
  email: `test-user-${uuidv4().substring(0, 8)}@example.com`,
  name: 'Test User',
  role: 'INTERVIEWEE',
  passwordHash: 'test-password-hash'
};

// Main test function
async function runEndToEndTest() {
  console.log('🚀 Starting end-to-end video analysis test');
  
  try {
    // Step 1: Create test user
    console.log('\n📝 Creating test user...');
    const user = await prisma.user.create({
      data: {
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
        passwordHash: testUser.passwordHash
      }
    });
    console.log(`✅ Created test user: ${user.email} (${user.id})`);
    
    // Step 2: Create test interview session
    console.log('\n📝 Creating test interview session...');
    const session = await prisma.interviewSession.create({
      data: {
        type: 'AI',
        status: 'COMPLETED',
        intervieweeId: user.id,
        interviewType: 'BEHAVIORAL',
        difficulty: 'MEDIUM',
        duration: 15,
        startedAt: new Date(),
        endedAt: new Date()
      }
    });
    console.log(`✅ Created test interview session: ${session.id}`);
    
    // Step 3: Create recording with video URI
    console.log('\n📝 Creating test recording with video URI...');
    const recording = await prisma.recording.create({
      data: {
        sessionId: session.id,
        url: TEST_VIDEO_URI,
        durationSec: 60,
        consent: true
      }
    });
    console.log(`✅ Created test recording: ${recording.id} with URI: ${recording.url}`);
    
    // Step 4: Test POST endpoint with API key authentication
    console.log('\n🔍 Testing POST /api/video-analysis endpoint...');
    const postResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        sessionId: session.id,
        videoUri: recording.url
      })
    });
    
    const postResult = await postResponse.json();
    console.log(`Status: ${postResponse.status}`);
    console.log('Response:', JSON.stringify(postResult, null, 2));
    
    if (postResponse.ok) {
      console.log('✅ POST request successful');
      
      // Step 5: Wait for analysis to process
      console.log('\n⏳ Waiting 10 seconds for analysis to start processing...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Step 6: Test GET endpoint to retrieve analysis results
      console.log('\n🔍 Testing GET /api/video-analysis endpoint...');
      const getResponse = await fetch(`${API_URL}?sessionId=${session.id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      });
      
      const getResult = await getResponse.json();
      console.log(`Status: ${getResponse.status}`);
      console.log('Response:', JSON.stringify(getResult, null, 2));
      
      if (getResponse.ok) {
        console.log('✅ GET request successful');
      } else {
        console.log('❌ GET request failed');
      }
      
      // Step 7: Check database for video analysis record
      console.log('\n🔍 Checking database for video analysis record...');
      const videoAnalysis = await prisma.videoAnalysis.findFirst({
        where: {
          sessionId: session.id,
          userId: user.id
        }
      });
      
      if (videoAnalysis) {
        console.log('✅ Video analysis record found in database');
        console.log('Analysis ID:', videoAnalysis.id);
        console.log('Created at:', videoAnalysis.createdAt);
        console.log('Results sample:', videoAnalysis.results.substring(0, 100) + '...');
      } else {
        console.log('❌ No video analysis record found in database');
      }
    } else {
      console.log('❌ POST request failed');
    }
    
    console.log('\n📊 Test Summary:');
    console.log('- User creation:', '✅ Success');
    console.log('- Session creation:', '✅ Success');
    console.log('- Recording creation:', '✅ Success');
    console.log('- POST request:', postResponse.ok ? '✅ Success' : '❌ Failed');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    await prisma.$disconnect();
  }
}

// Run the test
runEndToEndTest();
