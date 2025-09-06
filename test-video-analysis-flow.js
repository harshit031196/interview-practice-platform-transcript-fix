// Test script to verify the complete video analysis flow
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configuration
const TEST_SESSION_ID = 'test-session-' + Date.now();
const TEST_VIDEO_URI = 'gs://interview-recordings/test-video-' + Date.now() + '.mp4';
const API_BASE_URL = 'http://localhost:3000';

// Helper function to log with timestamps
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Main test function
async function testVideoAnalysisFlow() {
  try {
    log('Starting video analysis flow test');
    
    // Step 1: Create a test session in the database
    log('Creating test session in database...');
    const session = await prisma.interviewSession.create({
      data: {
        id: TEST_SESSION_ID,
        userId: 'cmexwu4d50000atgub3z63fdc', // Use an existing user ID
        interviewType: 'technical',
        difficulty: 'medium',
        status: 'in_progress',
        isConversational: false,
        duration: 30
      }
    });
    log(`Test session created: ${session.id}`);
    
    // Step 2: Simulate authentication
    log('Simulating authentication...');
    const authResponse = await fetch(`${API_BASE_URL}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      throw new Error(`Authentication failed: ${authResponse.status} ${authResponse.statusText}`);
    }
    
    const authData = await authResponse.json();
    log(`Authentication successful: ${JSON.stringify(authData)}`);
    
    // Step 3: Update video URI in the database
    log('Updating video URI in database...');
    const updateUriResponse = await fetch(`${API_BASE_URL}/api/interviews/update-video-uri`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        videoUri: TEST_VIDEO_URI
      })
    });
    
    if (!updateUriResponse.ok) {
      throw new Error(`Failed to update video URI: ${updateUriResponse.status} ${updateUriResponse.statusText}`);
    }
    
    const updateUriData = await updateUriResponse.json();
    log(`Video URI updated: ${JSON.stringify(updateUriData)}`);
    
    // Step 4: Trigger video analysis
    log('Triggering video analysis...');
    const analysisResponse = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': TEST_SESSION_ID
      },
      body: JSON.stringify({
        videoUri: TEST_VIDEO_URI,
        sessionId: TEST_SESSION_ID
      })
    });
    
    if (!analysisResponse.ok) {
      throw new Error(`Video analysis failed: ${analysisResponse.status} ${analysisResponse.statusText}`);
    }
    
    const analysisData = await analysisResponse.json();
    log(`Video analysis triggered successfully: ${JSON.stringify(analysisData)}`);
    
    // Step 5: Check if video analysis was created
    log('Checking if video analysis was created...');
    const videoAnalysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId: TEST_SESSION_ID
      }
    });
    
    if (videoAnalysis) {
      log(`Video analysis record found: ${JSON.stringify(videoAnalysis)}`);
    } else {
      log('No video analysis record found. This is expected if analysis is still in progress.');
    }
    
    // Step 6: Clean up test session
    log('Cleaning up test session...');
    await prisma.interviewSession.update({
      where: {
        id: TEST_SESSION_ID
      },
      data: {
        status: 'completed'
      }
    });
    
    log('Test completed successfully!');
  } catch (error) {
    log(`Error: ${error.message}`);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testVideoAnalysisFlow();
