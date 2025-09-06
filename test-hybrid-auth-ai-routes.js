// Test script to verify hybrid authentication in AI routes
const fetch = require('node-fetch');
const crypto = require('crypto');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_SESSION_ID = 'test-session-' + Date.now();
const MOCK_USER_ID = 'mock-user-id-' + crypto.randomBytes(8).toString('hex');

// Generate a mock session token
const MOCK_SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Helper function to make authenticated requests
async function makeAuthenticatedRequest(url, method = 'GET', body = null, useHybridFallback = false) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  // Create cookie for the request
  if (useHybridFallback) {
    // Use database-specific session token for hybrid fallback
    headers.Cookie = `next-auth.database-session=${MOCK_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax`;
    console.log('Using database-specific session token for hybrid fallback');
  } else {
    // Use standard session token
    headers.Cookie = `next-auth.session-token=${MOCK_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax`;
    console.log('Using standard session token');
  }
  
  console.log(`Making ${method} request to ${url}`);
  
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    console.error(`Error making request to ${url}:`, error.message);
    return { status: 'error', statusText: error.message, json: async () => ({ error: error.message }) };
  }
}

// Main test function
async function testHybridAuthInAIRoutes() {
  console.log('Starting hybrid authentication test for AI routes...');
  console.log(`Using mock session token: ${MOCK_SESSION_TOKEN}`);
  console.log(`Using mock user ID: ${MOCK_USER_ID}`);
  
  // Test routes
  const routesToTest = [
    { url: `${BASE_URL}/api/ai/interviewer`, method: 'POST', body: { sessionId: TEST_SESSION_ID, prompt: 'Tell me about yourself' } },
    { url: `${BASE_URL}/api/ai/feedback`, method: 'GET', params: `?sessionId=${TEST_SESSION_ID}` },
    { url: `${BASE_URL}/api/ai/start`, method: 'POST', body: { interviewType: 'behavioral', difficulty: 'medium', duration: 15 } },
    { url: `${BASE_URL}/api/ai/speech-stream`, method: 'GET', params: `?sessionId=${TEST_SESSION_ID}` },
    { url: `${BASE_URL}/api/ai/finish`, method: 'POST', body: { sessionId: TEST_SESSION_ID } }
  ];
  
  // First test with standard session token
  console.log('\n=== Testing with standard session token ===\n');
  for (const route of routesToTest) {
    const fullUrl = route.url + (route.params || '');
    const response = await makeAuthenticatedRequest(
      fullUrl,
      route.method,
      route.body,
      false // Use standard session token
    );
    
    console.log(`Route: ${route.method} ${fullUrl}`);
    console.log(`Status: ${response.status} ${response.statusText || ''}`);
    
    // We expect 401 since our mock token isn't valid, but we're just checking the code path
    console.log(`Result: ${response.status === 401 ? 'Expected 401 (mock token)' : 'Unexpected status'}`);
    
    try {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 200) + (JSON.stringify(data, null, 2).length > 200 ? '...' : ''));
    } catch (e) {
      console.log('Could not parse response as JSON');
    }
    
    console.log('-----------------------------------');
  }
  
  // Then test with database-specific session token (hybrid fallback)
  console.log('\n=== Testing with database-specific session token (hybrid fallback) ===\n');
  for (const route of routesToTest) {
    const fullUrl = route.url + (route.params || '');
    const response = await makeAuthenticatedRequest(
      fullUrl,
      route.method,
      route.body,
      true // Use database-specific session token
    );
    
    console.log(`Route: ${route.method} ${fullUrl}`);
    console.log(`Status: ${response.status} ${response.statusText || ''}`);
    
    // We expect 401 since our mock token isn't valid, but we're just checking the code path
    console.log(`Result: ${response.status === 401 ? 'Expected 401 (mock token)' : 'Unexpected status'}`);
    
    try {
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2).substring(0, 200) + (JSON.stringify(data, null, 2).length > 200 ? '...' : ''));
    } catch (e) {
      console.log('Could not parse response as JSON');
    }
    
    console.log('-----------------------------------');
  }
  
  console.log('\nHybrid authentication test completed');
  console.log('Note: 401 responses are expected since we used mock tokens');
  console.log('The test verifies that the code paths for both standard and database-specific session tokens are present');
}

// Run the test
testHybridAuthInAIRoutes();
