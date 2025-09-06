// Test script to verify database session authentication with video analysis API
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Initialize Prisma client
const prisma = new PrismaClient();

// Test video URI in Google Cloud Storage
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/test-videos/sample-interview.mp4';
const TEST_SESSION_ID = 'test-session-' + Date.now();

// Helper function to find an existing valid session from the database
async function findValidSession() {
  console.log('Looking for a valid session in the database...');
  
  // Find the most recent session that hasn't expired
  const now = new Date();
  const session = await prisma.session.findFirst({
    where: {
      expires: {
        gt: now
      }
    },
    orderBy: {
      expires: 'desc'
    },
    include: {
      user: true
    }
  });
  
  if (!session) {
    console.log('No valid session found in the database');
    return null;
  }
  
  console.log(`Found valid session for user: ${session.user.email}`);
  return session;
}

// Helper function to create a test video analysis record in the database
async function createTestVideoAnalysis(sessionId, userId) {
  console.log('Creating test video analysis record in the database...');
  
  // Create a unique ID for the video analysis
  const analysisId = 'test-analysis-' + Date.now();
  
  // Create a sample analysis result
  const sampleResults = {
    duration: '15s',
    faceDetection: {
      detected: true,
      count: 1
    },
    speechTranscription: {
      hasAudio: true,
      transcript: 'This is a test transcript.'
    },
    personDetection: {
      detected: true,
      count: 1
    },
    textDetection: {
      detected: false,
      text: ''
    },
    confidence: 0.95,
    timestamp: new Date().toISOString(),
    audioProcessingMethod: 'video-intelligence-api'
  };
  
  try {
    // Check if a video analysis already exists for this session and user
    const existingAnalysis = await prisma.videoAnalysis.findFirst({
      where: {
        sessionId,
        userId
      }
    });
    
    if (existingAnalysis) {
      console.log('Found existing video analysis:', existingAnalysis.id);
      return existingAnalysis;
    }
    
    // Create a new video analysis record
    const videoAnalysis = await prisma.videoAnalysis.create({
      data: {
        id: analysisId,
        sessionId,
        userId,
        results: JSON.stringify(sampleResults)
      }
    });
    
    console.log('Test video analysis created:', videoAnalysis.id);
    return videoAnalysis;
  } catch (error) {
    console.error('Error creating test video analysis:', error);
    throw error;
  }
}

// Helper function to find or create a test interview session
async function findOrCreateTestInterviewSession(userId) {
  console.log('Finding or creating test interview session...');
  
  // Check if we already have a test session
  const existingSession = await prisma.interviewSession.findFirst({
    where: {
      intervieweeId: userId,
      status: 'RUNNING'
    }
  });
  
  if (existingSession) {
    console.log('Found existing interview session:', existingSession.id);
    return existingSession;
  }
  
  // Create a new test session
  const interviewSession = await prisma.interviewSession.create({
    data: {
      id: TEST_SESSION_ID,
      intervieweeId: userId,
      type: 'AI',
      status: 'RUNNING',
      interviewType: 'BEHAVIORAL',
      difficulty: 'MEDIUM',
      duration: 15,
      isConversational: true
    }
  });
  
  console.log('Test interview session created:', interviewSession.id);
  return interviewSession;
}

// Helper function to test video analysis API with database session authentication
async function testVideoAnalysisWithDatabaseSession(sessionToken, sessionId) {
  console.log('Testing video analysis API with database session authentication...');
  
  try {
    // Set up cookies for database session authentication
    const cookies = `next-auth.session-token=${sessionToken}`;
    
    // Call the video analysis API
    const response = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'X-Auth-Method': 'database-session'
      },
      body: JSON.stringify({
        videoUri: TEST_VIDEO_URI,
        sessionId: sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API request failed with status ${response.status}:`, errorText);
      return { success: false, data: null };
    }
    
    const result = await response.json();
    console.log('Video analysis API response:', JSON.stringify(result, null, 2));
    return { success: true, data: result };
  } catch (error) {
    console.error('Error testing video analysis API:', error);
    return { success: false, data: null };
  }
}

// Helper function to test video analysis API with GET endpoint
async function testGetEndpoint(sessionId, sessionCookie, analysisId) {
  console.log('Testing GET endpoint...');
  console.log('Testing video analysis GET endpoint with database session authentication...');

  try {
    // Use the analysisId from the POST response, or a default test ID if not available
    const queryParams = new URLSearchParams({ analysisId: analysisId || 'test-analysis-id' });
    const response = await fetch(`http://localhost:3000/api/video-analysis?${queryParams}`, {
      method: 'GET',
      headers: {
        'Cookie': sessionCookie,
        'X-Auth-Method': 'database-session'
      },
      credentials: 'include'
    });

    console.log('GET Response status:', response.status);
    const data = await response.json();

    if (response.ok) {
      console.log('GET API response:', JSON.stringify(data, null, 2));
      console.log('✅ GET endpoint test passed!');
      return true;
    } else {
      console.log('GET API request failed with status ' + response.status + ':', JSON.stringify(data));
      console.log('❌ GET endpoint test failed!');
      return false;
    }
  } catch (error) {
    console.log('GET API request error:', error.message);
    console.log('❌ GET endpoint test failed!');
    return false;
  }
}

// Main test function
async function runTest() {
  console.log('Starting database session authentication test...');
  
  try {
    // Find a valid session in the database
    const session = await findValidSession();
    
    if (!session) {
      console.error('No valid session found. Please log in through the browser first.');
      return;
    }
    
    // Find or create a test interview session
    const interviewSession = await findOrCreateTestInterviewSession(session.userId);
    
    // Test video analysis API with database session
    console.log('Testing POST endpoint...');
    const postResult = await testVideoAnalysisWithDatabaseSession(session.sessionToken, interviewSession.id);
    
    if (!postResult.success) {
      console.log('Test failed at POST endpoint!');
      return;
    }
    console.log('✅ POST endpoint test passed!');

    // Create a test video analysis record in the database
    const videoAnalysis = await createTestVideoAnalysis(interviewSession.id, session.userId);
    const analysisId = videoAnalysis.id;
    console.log('Using analysis ID for GET test:', analysisId);

    // Test GET endpoint
    const getSuccess = await testGetEndpoint(interviewSession.id, `next-auth.session-token=${session.sessionToken}`, analysisId);
    if (!getSuccess) {
      console.log('Test failed at GET endpoint!');
    } else {
      console.log('✅ GET endpoint test passed!');
    }
    
    console.log('Test completed!');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    // Clean up
    await prisma.$disconnect();
  }
}

// Run the test
runTest();
