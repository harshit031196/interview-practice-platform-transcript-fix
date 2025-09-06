/**
 * Test script to verify hybrid JWT + database session authentication flow for video analysis
 * 
 * This script tests:
 * 1. Video analysis API call with JWT authentication
 * 2. Video analysis API call with database session authentication
 * 3. API key fallback authentication
 * 4. GET endpoint with hybrid authentication
 * 
 * Usage: node test-jwt-video-analysis.js
 */

const { v4: uuidv4 } = require('uuid');
const http = require('http');

// Configuration
const TEST_SESSION_ID = 'test-session-' + uuidv4().substring(0, 8);
const TEST_VIDEO_URI = 'gs://interview-recordings-dev/test-video.webm';
const API_KEY = process.env.API_KEY || ''; // Use actual API key from env
const API_SECRET_KEY = process.env.API_SECRET_KEY || ''; // Use actual API secret from env
const HOST = 'localhost';
const PORT = 3000;
const TEST_JWT_TOKEN = process.env.TEST_JWT_TOKEN || ''; // JWT token for testing
const TEST_DB_SESSION_TOKEN = process.env.TEST_DB_SESSION_TOKEN || ''; // Database session token for testing

// Helper function to log with timestamp
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = responseBody ? JSON.parse(responseBody) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(data);
    }
    req.end();
  });
}

// Main test function
async function testHybridVideoAnalysis() {
  try {
    log('Starting hybrid JWT + database session video analysis authentication test');
    
    // Test 1: Test video analysis API with JWT auth header (should be rejected without valid JWT)
    log('\nTest 1: Testing video analysis API with JWT auth header');
    const jwtAuthOptions = {
      hostname: HOST,
      port: PORT,
      path: '/api/video-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Method': 'hybrid-session',
        'X-Session-ID': TEST_SESSION_ID,
        'Cookie': TEST_JWT_TOKEN ? `next-auth.session-token=${TEST_JWT_TOKEN}` : '' // JWT token if provided
      }
    };
    
    const jwtAuthData = JSON.stringify({
      videoUri: TEST_VIDEO_URI,
      sessionId: TEST_SESSION_ID,
      analysisType: 'comprehensive'
    });
    
    log(`Sending request with JWT auth headers and session ID: ${TEST_SESSION_ID}`);
    const jwtAuthResponse = await makeRequest(jwtAuthOptions, jwtAuthData);
    log(`JWT auth response status: ${jwtAuthResponse.statusCode}`);
    log(`JWT auth response body: ${JSON.stringify(jwtAuthResponse.body)}`);
    
    // Expected: 401 Unauthorized if no valid JWT token, 200 if valid token
    const expectedJwtStatus = TEST_JWT_TOKEN ? 200 : 401;
    log(`JWT auth test result: ${jwtAuthResponse.statusCode === expectedJwtStatus ? 'PASS' : 'FAIL'} (expected ${expectedJwtStatus})`);
    
    // Test 2a: Test video analysis API with invalid database session auth header (should be rejected)
    log('\nTest 2a: Testing video analysis API with invalid database session auth header');
    const invalidDbSessionAuthOptions = {
      hostname: HOST,
      port: PORT,
      path: '/api/video-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Method': 'hybrid-session',
        'X-Session-ID': TEST_SESSION_ID,
        'Cookie': '' // No session cookie provided, should fail
      }
    };
    
    const dbSessionAuthData = JSON.stringify({
      videoUri: TEST_VIDEO_URI,
      sessionId: TEST_SESSION_ID,
      analysisType: 'comprehensive'
    });
    
    log(`Sending request with invalid database session auth headers and session ID: ${TEST_SESSION_ID}`);
    const invalidDbSessionAuthResponse = await makeRequest(invalidDbSessionAuthOptions, dbSessionAuthData);
    log(`Invalid database session auth response status: ${invalidDbSessionAuthResponse.statusCode}`);
    log(`Invalid database session auth response body: ${JSON.stringify(invalidDbSessionAuthResponse.body)}`);
    
    // Expected: 401 Unauthorized since we don't have a valid database session
    log(`Invalid database session auth test result: ${invalidDbSessionAuthResponse.statusCode === 401 ? 'PASS' : 'FAIL'}`);
    
    // Test 2b: Test video analysis API with valid database session token (should be accepted if valid token provided)
    if (TEST_DB_SESSION_TOKEN) {
      log('\nTest 2b: Testing video analysis API with valid database session token');
      const validDbSessionAuthOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/video-analysis',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Method': 'hybrid-session',
          'X-Session-ID': TEST_SESSION_ID,
          'Cookie': `next-auth.database-session=${TEST_DB_SESSION_TOKEN}` // Use database-specific session token
        }
      };
      
      log(`Sending request with valid database session token and session ID: ${TEST_SESSION_ID}`);
      const validDbSessionAuthResponse = await makeRequest(validDbSessionAuthOptions, dbSessionAuthData);
      log(`Valid database session auth response status: ${validDbSessionAuthResponse.statusCode}`);
      log(`Valid database session auth response body: ${JSON.stringify(validDbSessionAuthResponse.body)}`);
      
      // Expected: 200 OK if valid database session token
      log(`Valid database session auth test result: ${validDbSessionAuthResponse.statusCode === 200 ? 'PASS' : 'FAIL'}`);
    } else {
      log('Skipping valid database session test - no TEST_DB_SESSION_TOKEN provided');
    }
    
    // Test 3: Test video analysis API with API key (should be accepted if valid key provided)
    log('\nTest 3: Testing video analysis API with API key');
    const apiKeyOptions = {
      hostname: HOST,
      port: PORT,
      path: '/api/video-analysis',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY || 'invalid-key'}`,
        'X-Session-ID': TEST_SESSION_ID
      }
    };
    
    const apiKeyData = JSON.stringify({
      videoUri: TEST_VIDEO_URI,
      sessionId: TEST_SESSION_ID,
      analysisType: 'comprehensive'
    });
    
    log(`Sending request with API key and session ID: ${TEST_SESSION_ID}`);
    const apiKeyResponse = await makeRequest(apiKeyOptions, apiKeyData);
    log(`API key response status: ${apiKeyResponse.statusCode}`);
    log(`API key response body: ${JSON.stringify(apiKeyResponse.body)}`);
    
    // If API_KEY is set and valid, this should succeed (200), otherwise fail (401)
    const expectedApiKeyStatus = API_KEY ? 200 : 401;
    log(`API key test result: ${apiKeyResponse.statusCode === expectedApiKeyStatus ? 'PASS' : 'FAIL'} (expected ${expectedApiKeyStatus})`);
    
    // Test 3b: Test with API secret key as fallback
    if (API_SECRET_KEY) {
      log('\nTest 3b: Testing video analysis API with API secret key');
      const apiSecretOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/video-analysis',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_SECRET_KEY}`,
          'X-Session-ID': TEST_SESSION_ID
        }
      };
      
      log(`Sending request with API secret key and session ID: ${TEST_SESSION_ID}`);
      const apiSecretResponse = await makeRequest(apiSecretOptions, apiKeyData);
      log(`API secret key response status: ${apiSecretResponse.statusCode}`);
      log(`API secret key test result: ${apiSecretResponse.statusCode === 200 ? 'PASS' : 'FAIL'}`);
    }
    
    // Test 4a: Test GET endpoint with JWT auth header (should be rejected without valid session)
    log('\nTest 4a: Testing GET endpoint with JWT auth header');
    const getJwtOptions = {
      hostname: HOST,
      port: PORT,
      path: '/api/video-analysis?analysisId=test-analysis',
      method: 'GET',
      headers: {
        'X-Auth-Method': 'hybrid-session',
        'Cookie': TEST_JWT_TOKEN ? `next-auth.session-token=${TEST_JWT_TOKEN}` : '' // JWT token if provided
      }
    };
    
    log(`Sending GET request with JWT auth headers`);
    const getJwtResponse = await makeRequest(getJwtOptions);
    log(`GET JWT response status: ${getJwtResponse.statusCode}`);
    log(`GET JWT response body: ${JSON.stringify(getJwtResponse.body)}`);
    
    // Expected: 401 Unauthorized if no valid JWT token, 404 if valid token (since test-analysis doesn't exist)
    const expectedJwtGetStatus = TEST_JWT_TOKEN ? 404 : 401;
    log(`GET JWT auth test result: ${getJwtResponse.statusCode === expectedJwtGetStatus ? 'PASS' : 'FAIL'} (expected ${expectedJwtGetStatus})`);
    
    // Test 4b: Test GET endpoint with database session token (should be accepted if valid token provided)
    if (TEST_DB_SESSION_TOKEN) {
      log('\nTest 4b: Testing GET endpoint with database session token');
      const getDbSessionOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/video-analysis?analysisId=test-analysis',
        method: 'GET',
        headers: {
          'X-Auth-Method': 'hybrid-session',
          'Cookie': `next-auth.database-session=${TEST_DB_SESSION_TOKEN}` // Use database-specific session token
        }
      };
      
      log(`Sending GET request with database session token`);
      const getDbSessionResponse = await makeRequest(getDbSessionOptions);
      log(`GET database session response status: ${getDbSessionResponse.statusCode}`);
      log(`GET database session response body: ${JSON.stringify(getDbSessionResponse.body)}`);
      
      // Expected: 404 if valid token (since test-analysis doesn't exist)
      log(`GET database session auth test result: ${getDbSessionResponse.statusCode === 404 ? 'PASS' : 'FAIL'} (expected 404)`);
    } else {
      log('Skipping database session GET test - no TEST_DB_SESSION_TOKEN provided');
    }
    
    // Test 5: Test GET endpoint with API key
    if (API_KEY) {
      log('\nTest 5: Testing GET endpoint with API key');
      const getApiKeyOptions = {
        hostname: HOST,
        port: PORT,
        path: '/api/video-analysis?analysisId=test-analysis',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        }
      };
      
      log(`Sending GET request with API key`);
      const getApiKeyResponse = await makeRequest(getApiKeyOptions);
      log(`GET API key response status: ${getApiKeyResponse.statusCode}`);
      log(`GET API key test result: ${getApiKeyResponse.statusCode === 404 ? 'PASS' : 'FAIL'} (404 expected since test-analysis doesn't exist)`);
    }
    
    // Summary
    log('\n=== TEST SUMMARY ===');
    log(`JWT Authentication: ${TEST_JWT_TOKEN ? (jwtAuthResponse.statusCode === 200 ? 'WORKING' : 'NOT WORKING') : 'NOT TESTED (no JWT token)'}`);    
    log(`Invalid Database Session Authentication Enforcement: ${invalidDbSessionAuthResponse.statusCode === 401 ? 'WORKING' : 'NOT WORKING'}`);
    if (TEST_DB_SESSION_TOKEN) {
      log(`Valid Database Session Authentication: ${validDbSessionAuthResponse.statusCode === 200 ? 'WORKING' : 'NOT WORKING'}`);
    }
    log(`API Key Authentication: ${API_KEY ? (apiKeyResponse.statusCode === 200 ? 'WORKING' : 'NOT WORKING') : 'NOT TESTED (no API key)'}`);    
    log(`JWT GET Endpoint Authentication: ${getJwtResponse.statusCode === expectedJwtGetStatus ? 'WORKING' : 'NOT WORKING'}`);
    if (TEST_DB_SESSION_TOKEN) {
      log(`Database Session GET Endpoint Authentication: ${getDbSessionResponse.statusCode === 404 ? 'WORKING' : 'NOT WORKING'}`);
    }
    
    log('\nTest completed successfully');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testHybridVideoAnalysis();
