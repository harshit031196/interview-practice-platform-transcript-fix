require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const chalk = require('chalk');

// Configuration
const API_BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3006';
const API_SECRET_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY;

// Test video URI - this should be a valid GCS URI to an existing video
const TEST_VIDEO_URI = process.env.TEST_VIDEO_URI || 'gs://wingman-interview-videos-harshit-2024/interviews/test/sample_video.webm';

// Generate a unique request ID for tracking
const requestId = `test-${uuidv4().substring(0, 8)}`;

// Logging utilities
const log = {
  info: (message) => console.log(chalk.blue(`[INFO] ${message}`)),
  success: (message) => console.log(chalk.green(`[SUCCESS] ${message}`)),
  error: (message) => console.log(chalk.red(`[ERROR] ${message}`)),
  warning: (message) => console.log(chalk.yellow(`[WARNING] ${message}`)),
  step: (message) => console.log(chalk.cyan(`\n[STEP] ${message}`)),
  api: (message) => console.log(chalk.bgBlue.white(`[API] ${message}`)),
  json: (obj) => console.log(JSON.stringify(obj, null, 2))
};

// Main test function
async function testVideoAnalysisWithApiKey() {
  if (!API_SECRET_KEY) {
    log.error('API_SECRET_KEY not found in environment variables');
    log.info('Please set NEXT_PUBLIC_API_SECRET_KEY in .env.local');
    process.exit(1);
  }

  log.step(`Starting API key authentication test (Request ID: ${requestId})`);
  log.info(`API Base URL: ${API_BASE_URL}`);
  log.info(`Test Video URI: ${TEST_VIDEO_URI}`);
  
  // Create a test session ID
  const sessionId = `test-session-${Date.now()}`;
  log.info(`Test Session ID: ${sessionId}`);

  try {
    log.step('Making API request with API key authentication');
    
    const requestBody = {
      videoUri: TEST_VIDEO_URI,
      sessionId: sessionId,
      analysisType: 'comprehensive',
      requestId: requestId,
      isTestCall: true
    };
    
    log.api(`POST ${API_BASE_URL}/api/video-analysis`);
    log.info('Request body:');
    log.json(requestBody);
    
    const startTime = Date.now();
    const response = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_SECRET_KEY}`,
        'X-Request-ID': requestId
      },
      body: JSON.stringify(requestBody)
    });
    const endTime = Date.now();
    
    log.info(`Response time: ${endTime - startTime}ms`);
    log.info(`Response status: ${response.status} ${response.statusText}`);
    
    // Log response headers
    log.info('Response headers:');
    const headers = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    log.json(headers);
    
    // Get response body
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
      log.info('Response data:');
      log.json(responseData);
    } catch (e) {
      log.warning('Response is not valid JSON');
      log.info(`Raw response: ${responseText.substring(0, 1000)}${responseText.length > 1000 ? '...' : ''}`);
    }
    
    if (response.ok) {
      log.success('API key authentication test passed!');
      log.info('The video analysis API accepted the request with API key authentication');
      
      if (responseData && responseData.success) {
        log.success('Video analysis process started successfully');
        if (responseData.analysisId) {
          log.info(`Analysis ID: ${responseData.analysisId}`);
        }
      } else {
        log.warning('API returned success status but response data indicates an issue');
      }
    } else {
      log.error('API key authentication test failed');
      log.error(`Status code: ${response.status}`);
      log.error(`Error message: ${responseText}`);
    }
    
  } catch (error) {
    log.error('Error making API request:');
    log.error(error.message);
    if (error.stack) {
      log.error(error.stack);
    }
  }
}

// Run the test
testVideoAnalysisWithApiKey();
