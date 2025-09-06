// Test script to verify the video analysis API with API key authentication
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

// Configuration
const TEST_SESSION_ID = 'test-session-' + Date.now();
const TEST_VIDEO_URI = 'gs://interview-recordings/test-video-' + Date.now() + '.mp4';
const API_BASE_URL = 'http://localhost:3000';
const API_KEY = process.env.VIDEO_ANALYSIS_API_KEY || 'test-api-key';

// Helper function to log with timestamps
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Main test function
async function testApiKeyAuth() {
  try {
    log('Starting video analysis API test with API key authentication');
    log(`Using API key: ${API_KEY.substring(0, 3)}...${API_KEY.substring(API_KEY.length - 3)}`);
    
    // Step 1: Trigger video analysis with API key
    log('Triggering video analysis with API key...');
    const analysisResponse = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
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
      log('FAILED: Received 401 Unauthorized error. API key authentication issue exists.');
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
testApiKeyAuth();
