// Test script to directly create a database session and test authentication
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';

// Helper function for logging with timestamps
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Helper function to find a user by email
async function findUserByEmail(email) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        sessions: true,
      },
    });
    
    if (!user) {
      log(`No user found with email: ${email}`);
      return null;
    }
    
    log(`Found user: ${user.email} (${user.id})`);
    log(`User has ${user.sessions.length} sessions`);
    
    return user;
  } catch (error) {
    log(`Error finding user: ${error.message}`);
    return null;
  }
}

// Helper function to create a session directly in the database
async function createDirectDatabaseSession(userId) {
  try {
    // Generate a random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiry (30 days from now)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    log(`Creating session for user ID: ${userId}`);
    log(`Session token: ${sessionToken.substring(0, 10)}...`);
    log(`Expires: ${expires.toISOString()}`);
    
    // Create the session in the database
    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
      },
    });
    
    log(`Session created with ID: ${session.id}`);
    return { session, sessionToken };
  } catch (error) {
    log(`Error creating session: ${error.message}`);
    return null;
  }
}

// Helper function to test video analysis API with session token
async function testVideoAnalysisWithSessionToken(sessionToken, sessionId) {
  try {
    log(`Testing video analysis API with session token: ${sessionToken.substring(0, 10)}...`);
    
    // Create a test interview session if sessionId is not provided
    let interviewSessionId = sessionId;
    if (!interviewSessionId) {
      log('Creating a test interview session first');
      const response = await fetch(`${BASE_URL}/api/ai/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `next-auth.session-token=${sessionToken}`,
        },
        body: JSON.stringify({
          interviewType: 'Product Manager',
          difficulty: 'MEDIUM',
          duration: 15,
          isConversational: false
        }),
      });
      
      if (!response.ok) {
        log(`Failed to create interview session: ${response.status} - ${await response.text()}`);
        return null;
      }
      
      const data = await response.json();
      interviewSessionId = data.sessionId;
      log(`Created interview session with ID: ${interviewSessionId}`);
    }
    
    // Test the video analysis API
    log(`Testing video analysis API for session: ${interviewSessionId}`);
    const testVideoUrl = 'https://storage.googleapis.com/wingman-interview-videos-harshit-2024/test-video.mp4';
    
    const response = await fetch(`${BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${sessionToken}`,
      },
      body: JSON.stringify({
        sessionId: interviewSessionId,
        videoUri: testVideoUrl,
      }),
    });
    
    log(`Video analysis API response status: ${response.status}`);
    
    if (!response.ok) {
      log(`Video analysis API error: ${await response.text()}`);
      return null;
    }
    
    const result = await response.json();
    log(`Video analysis API result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    log(`Error testing video analysis: ${error.message}`);
    return null;
  }
}

// Main test function
async function runTest() {
  log('Starting direct database session test');
  
  try {
    // Step 1: Find the test user
    const user = await findUserByEmail(TEST_EMAIL);
    
    if (!user) {
      log('❌ Test user not found. Please create a test user first.');
      return;
    }
    
    log('✅ Test user found');
    
    // Step 2: Create a session directly in the database
    const sessionResult = await createDirectDatabaseSession(user.id);
    
    if (!sessionResult) {
      log('❌ Failed to create database session');
      return;
    }
    
    log('✅ Database session created successfully');
    
    // Step 3: Test the video analysis API with the session token
    const analysisResult = await testVideoAnalysisWithSessionToken(sessionResult.sessionToken);
    
    if (!analysisResult) {
      log('❌ Video analysis failed with direct database session');
    } else {
      log('✅ Video analysis successful with direct database session');
    }
    
    // Test summary
    log('\n=== TEST SUMMARY ===');
    log(`User Found: PASS`);
    log(`Database Session: PASS`);
    log(`Video Analysis: ${analysisResult ? 'PASS' : 'FAIL'}`);
    
  } catch (error) {
    log(`Test failed with error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
runTest();
