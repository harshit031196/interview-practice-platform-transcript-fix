/**
 * End-to-end test for video analysis with database session authentication
 * 
 * This script tests:
 * 1. Creating a test user with credentials
 * 2. Creating a database session for the user
 * 3. Creating an interview session and recording
 * 4. Calling video analysis API with session cookie
 * 5. Verifying video analysis results are stored in database
 * 
 * Usage: node test-end-to-end-video-analysis-with-db-session.js
 */

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const prisma = new PrismaClient();

// Configuration
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/test/test_video_1756542164194.webm';
const TEST_SESSION_ID = 'test-session-' + uuidv4().substring(0, 8);
const TEST_EMAIL = `test-user-${uuidv4().substring(0, 8)}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const API_BASE_URL = 'http://localhost:3000';

// Helper function to log with timestamp
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

async function runEndToEndTest() {
  try {
    log('Starting end-to-end video analysis test with database session authentication');
    
    // Step 1: Create test user with credentials
    log('Creating test user with credentials');
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: 'Test User',
        role: 'INTERVIEWEE',
        passwordHash
      }
    });
    log(`Created test user: ${user.email} (${user.id})`);
    
    // Step 2: Create database session for the user
    log('Creating database session for the user');
    const sessionToken = uuidv4();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 days from now
    
    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires
      }
    });
    log(`Created database session: ${session.sessionToken}`);
    
    // Step 3: Create interview session and recording
    log('Creating interview session');
    const interviewSession = await prisma.interviewSession.create({
      data: {
        id: TEST_SESSION_ID,
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
    log(`Created interview session: ${interviewSession.id}`);
    
    log('Creating recording with video URI');
    const recording = await prisma.recording.create({
      data: {
        sessionId: interviewSession.id,
        url: TEST_VIDEO_URI,
        durationSec: 60,
        consent: true
      }
    });
    log(`Created recording: ${recording.id} with URI: ${recording.url}`);
    
    // Step 4: Call video analysis API with session cookie
    log('Calling video analysis API with session cookie');
    const cookieValue = `next-auth.session-token=${sessionToken}`;
    
    const response = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieValue,
        'X-Session-ID': interviewSession.id
      },
      body: JSON.stringify({
        videoUri: recording.url,
        sessionId: interviewSession.id,
        analysisType: 'comprehensive'
      })
    });
    
    if (response.ok) {
      log('Video analysis API call successful');
      const result = await response.json();
      log(`Analysis result sample: ${JSON.stringify(result).substring(0, 200)}...`);
    } else {
      log(`Video analysis API call failed with status: ${response.status}`);
      const errorText = await response.text();
      log(`Error: ${errorText}`);
      
      // If API call fails, try to debug the issue
      log('Debugging session authentication...');
      
      // Check if session exists in database
      const dbSession = await prisma.session.findUnique({
        where: { sessionToken }
      });
      log(`Session in database: ${dbSession ? 'YES' : 'NO'}`);
      
      if (dbSession) {
        log(`Session expires: ${dbSession.expires}`);
        log(`Session user ID: ${dbSession.userId}`);
        
        // Check if user ID matches
        log(`User ID match: ${dbSession.userId === user.id ? 'YES' : 'NO'}`);
      }
    }
    
    // Step 5: Verify video analysis results are stored in database
    log('Checking if video analysis was stored in database');
    const videoAnalysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId_userId: {
          sessionId: interviewSession.id,
          userId: user.id
        }
      }
    });
    
    if (videoAnalysis) {
      log('Video analysis successfully stored in database');
      log(`Analysis ID: ${videoAnalysis.id}`);
      log(`Created at: ${videoAnalysis.createdAt}`);
      log(`Results sample: ${videoAnalysis.results.substring(0, 100)}...`);
    } else {
      log('Video analysis was not stored in database');
    }
    
    log('\n📊 Test Summary:');
    log(`- User creation: ✅ Success`);
    log(`- Session creation: ✅ Success`);
    log(`- Interview session creation: ✅ Success`);
    log(`- Recording creation: ✅ Success`);
    log(`- Video analysis API call: ${response.ok ? '✅ Success' : '❌ Failed'}`);
    log(`- Database storage: ${videoAnalysis ? '✅ Success' : '❌ Failed'}`);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up test data
    log('Cleaning up test data');
    try {
      // Delete video analysis
      await prisma.videoAnalysis.deleteMany({
        where: {
          sessionId: TEST_SESSION_ID
        }
      });
      
      // Delete recording
      await prisma.recording.deleteMany({
        where: {
          sessionId: TEST_SESSION_ID
        }
      });
      
      // Delete interview session
      await prisma.interviewSession.delete({
        where: {
          id: TEST_SESSION_ID
        }
      });
      
      // Delete session
      await prisma.session.deleteMany({
        where: {
          userId: user.id
        }
      });
      
      // Delete user
      await prisma.user.delete({
        where: {
          id: user.id
        }
      });
      
      log('Test data cleanup completed');
    } catch (cleanupError) {
      log(`Error during cleanup: ${cleanupError.message}`);
    }
    
    await prisma.$disconnect();
  }
}

// Run the test
runEndToEndTest();
