// Test script to verify the video analysis API with authentication
const fetch = require('node-fetch');

// Configuration
const TEST_SESSION_ID = 'test-session-' + Date.now();
const TEST_VIDEO_URI = 'gs://interview-recordings/test-video-' + Date.now() + '.mp4';
const API_BASE_URL = 'http://localhost:3000';

// Helper function to log with timestamps
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Main test function
async function testVideoAnalysisAPI() {
  try {
    log('Starting video analysis API test');
    
    // Step 1: Simulate authentication
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
    log(`Authentication response: ${JSON.stringify(authData)}`);
    
    // Step 2: Update video URI in the database
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
    log(`Video URI update response: ${JSON.stringify(updateUriData)}`);
    
    // Step 3: Trigger video analysis
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
    
    const analysisStatus = analysisResponse.status;
    log(`Video analysis API status code: ${analysisStatus}`);
    
    try {
      const analysisData = await analysisResponse.json();
      log(`Video analysis API response: ${JSON.stringify(analysisData)}`);
    } catch (e) {
      log(`Could not parse response as JSON: ${e.message}`);
      const text = await analysisResponse.text();
      log(`Response text: ${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`);
    }
    
    // Check if we got a 401 Unauthorized error
    if (analysisStatus === 401) {
      log('FAILED: Received 401 Unauthorized error. Authentication issue still exists.');
    } else {
      log(`SUCCESS: Received status code ${analysisStatus}. No 401 Unauthorized error.`);
    }
    
    log('Test completed!');
  } catch (error) {
    log(`Error: ${error.message}`);
    console.error(error);
  }
}

// Run the test
testVideoAnalysisAPI();
