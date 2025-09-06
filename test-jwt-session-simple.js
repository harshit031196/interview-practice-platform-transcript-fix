/**
 * Simple test script for hybrid JWT + database session authentication
 * 
 * This script tests the JWT session authentication by:
 * 1. Creating a direct session via API
 * 2. Testing API calls with the JWT token
 */

const fetch = require('node-fetch');

// Test user credentials
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';
const BASE_URL = 'http://localhost:3000';

// Store session data
let cookies = [];

/**
 * Helper function to parse cookies from response headers
 */
function parseCookies(response) {
  const cookieHeader = response.headers.raw()['set-cookie'];
  if (!cookieHeader || cookieHeader.length === 0) return [];
  
  return cookieHeader.map(cookie => cookie.split(';')[0]);
}

/**
 * Create a direct session via API
 */
async function createDirectSession() {
  console.log('\n🔑 Creating direct session...');
  
  try {
    // Create direct session
    const response = await fetch(`${BASE_URL}/api/auth/create-direct-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Direct session creation failed with status ${response.status}`);
    }
    
    // Parse cookies from response
    cookies = parseCookies(response);
    console.log('✅ Direct session created');
    console.log('📝 Cookies received:', cookies.length);
    
    if (cookies.length === 0) {
      throw new Error('No cookies received from session creation');
    }
    
    // Get session data
    const sessionData = await response.json();
    console.log('📊 Session data:', sessionData);
    
    return true;
  } catch (error) {
    console.error('❌ Session creation failed:', error);
    return false;
  }
}

/**
 * Test API call with JWT authentication
 */
async function testApiWithJwt() {
  console.log('\n🌐 Testing API call with JWT authentication...');
  
  try {
    // Test API call with JWT token
    const response = await fetch(`${BASE_URL}/api/video-analysis`, {
      method: 'GET',
      headers: {
        Cookie: cookies.join('; '),
      },
    });
    
    console.log('📊 API response status:', response.status);
    
    // We expect a 400 or 404 error for invalid request, but not a 401 unauthorized
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Authentication failed with status ${response.status}`);
    }
    
    console.log('✅ Authentication successful');
    
    return true;
  } catch (error) {
    console.error('❌ API test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Starting simple JWT session authentication tests...');
  
  try {
    // Step 1: Create direct session
    const sessionSuccess = await createDirectSession();
    if (!sessionSuccess) {
      throw new Error('Session creation failed');
    }
    
    // Step 2: Test API with JWT
    const apiSuccess = await testApiWithJwt();
    if (!apiSuccess) {
      throw new Error('API test failed');
    }
    
    console.log('\n✅✅✅ All tests passed! JWT session authentication is working correctly.');
  } catch (error) {
    console.error('\n❌❌❌ Tests failed:', error);
  }
}

// Run the tests
runTests();
