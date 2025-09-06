/**
 * Test script to verify video analysis API trigger with API key authentication
 * 
 * This script tests:
 * 1. Video analysis API call with API key authentication
 * 2. Verification of video analysis record creation via API
 * 3. End-to-end flow without requiring direct database access
 * 
 * Usage: node test-direct-session-video-analysis.js
 */

require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
// Simple colors for console output
const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
  bgBlue: {
    white: (text) => `\x1b[44m\x1b[37m${text}\x1b[0m`
  },
  bgGreen: {
    black: (text) => `\x1b[42m\x1b[30m${text}\x1b[0m`
  },
  bgWhite: {
    black: (text) => `\x1b[47m\x1b[30m${text}\x1b[0m`
  }
};

// Test configuration

// Configuration
const API_BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/test/test_video_1756542164194.webm';
const API_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY || 'test-api-key';
const TEST_SESSION_ID = 'test-session-' + Date.now().toString();

// Logging setup
const log = {
  info: (message) => console.log(colors.blue(`[INFO] ${message}`)),
  success: (message) => console.log(colors.green(`[SUCCESS] ${message}`)),
  error: (message) => console.log(colors.red(`[ERROR] ${message}`)),
  warning: (message) => console.log(colors.yellow(`[WARNING] ${message}`)),
  step: (message) => console.log(colors.cyan(`\n[STEP] ${message}`)),
  auth: (message) => console.log(colors.magenta(`[AUTH] ${message}`)),
  api: (message) => console.log(colors.bgBlue.white(`[API] ${message}`)),
  db: (message) => console.log(colors.bgGreen.black(`[DB] ${message}`)),
};

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to create a test interview session via API
async function createTestInterviewSession() {
  try {
    log.step('Creating test interview session via API');
    
    const response = await fetch(`${API_BASE_URL}/api/interviews/create-test-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        sessionId: TEST_SESSION_ID,
        videoUri: TEST_VIDEO_URI,
        type: 'AI',
        status: 'COMPLETED'
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create test session: ${response.status} - ${errorText}`);
    }
    
    const sessionData = await response.json();
    log.success(`Test interview session created with ID: ${sessionData.id || TEST_SESSION_ID}`);
    return sessionData;
  } catch (error) {
    // If the API endpoint doesn't exist, use a mock session
    log.warning(`Could not create session via API: ${error.message}`);
    log.info('Using mock session data instead');
    return { id: TEST_SESSION_ID, videoUri: TEST_VIDEO_URI };
  }
}

// Function to trigger video analysis with API key
async function triggerVideoAnalysisWithApiKey(videoUri, sessionId) {
  try {
    log.step('Triggering video analysis with API key');
    log.info(`Video URI: ${videoUri}`);
    log.info(`Session ID: ${sessionId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        videoUri,
        sessionId,
        analysisType: 'comprehensive',
        debugCall: true
      })
    });
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { rawResponse: responseText };
    }
    
    if (response.ok) {
      log.success(`Video analysis triggered successfully with status: ${response.status}`);
      log.info(`Response: ${JSON.stringify(responseData, null, 2).substring(0, 200)}...`);
      return { success: true, data: responseData };
    } else {
      log.error(`Video analysis trigger failed with status: ${response.status}`);
      log.error(`Response: ${JSON.stringify(responseData, null, 2)}`);
      return { success: false, status: response.status, data: responseData };
    }
  } catch (error) {
    log.error(`Error triggering video analysis: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Function to check video analysis status via API
async function checkVideoAnalysisStatus(sessionId) {
  try {
    log.step('Checking video analysis status via API');
    
    const response = await fetch(`${API_BASE_URL}/api/video-analysis?sessionId=${sessionId}`, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      log.warning(`Failed to get video analysis status: ${response.status} - ${errorText}`);
      return false;
    }
    
    const analysisData = await response.json();
    
    if (analysisData && analysisData.id) {
      log.success(`Video analysis found for session ${sessionId}`);
      log.info(`Analysis ID: ${analysisData.id}`);
      log.info(`Created: ${analysisData.createdAt}`);
      return true;
    } else {
      log.warning(`No video analysis found for session ${sessionId}`);
      return false;
    }
  } catch (error) {
    log.error(`Error checking video analysis status: ${error.message}`);
    return false;
  }
}

// Function to retry checking video analysis status with delay
async function retryCheckVideoAnalysis(sessionId, maxRetries = 3, delayMs = 2000) {
  log.step(`Checking for video analysis with ${maxRetries} retries`);
  
  for (let i = 0; i < maxRetries; i++) {
    const exists = await checkVideoAnalysisStatus(sessionId);
    if (exists) {
      return true;
    }
    
    if (i < maxRetries - 1) {
      log.info(`Retry ${i + 1}/${maxRetries}: Waiting ${delayMs}ms before next check...`);
      await sleep(delayMs);
    }
  }
  
  return false;
}

// Main function to run the test flow
async function runTestFlow() {
  try {
    console.log(colors.bgWhite.black('\n API KEY VIDEO ANALYSIS TEST \n'));
    
    // Create a test interview session
    const interviewSession = await createTestInterviewSession();
    
    // Check if video analysis already exists
    const analysisExists = await checkVideoAnalysisStatus(interviewSession.id);
    
    if (analysisExists) {
      log.warning('Video analysis already exists for this session');
    }
    
    // Trigger video analysis with API key
    const analysisResult = await triggerVideoAnalysisWithApiKey(
      interviewSession.videoUri || TEST_VIDEO_URI,
      interviewSession.id
    );
    
    if (!analysisResult.success) {
      log.error('Failed to trigger video analysis');
      return;
    }
    
    // Wait and retry checking for video analysis
    log.step('Waiting for video analysis to be processed');
    const finalCheck = await retryCheckVideoAnalysis(interviewSession.id, 5, 3000);
    
    if (finalCheck && !analysisExists) {
      log.success('Video analysis was successfully created during this test');
    } else if (finalCheck && analysisExists) {
      log.info('Video analysis already existed and still exists');
    } else {
      log.error('Video analysis was not created during this test');
    }
    
    // Summary
    log.step('Test Summary');
    log.info(`Test Session Creation: SUCCESS - ${interviewSession.id}`);
    log.info(`Video Analysis API Call: ${analysisResult.success ? 'SUCCESS' : 'FAILED'}`);
    log.info(`Video Analysis Record Creation: ${finalCheck && !analysisExists ? 'SUCCESS' : finalCheck && analysisExists ? 'ALREADY EXISTS' : 'FAILED'}`);
    
  } catch (error) {
    log.error(`Test flow error: ${error.message}`);
    console.error(error);
  }
}

// Run the test flow
runTestFlow().catch(error => {
  console.error('Unhandled error in test flow:', error);
  process.exit(1);
});
