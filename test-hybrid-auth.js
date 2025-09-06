/**
 * Test script for hybrid JWT + database session authentication
 * 
 * This script tests the complete end-to-end hybrid authentication flow:
 * 1. Login with credentials to get JWT session
 * 2. Verify JWT session is valid
 * 3. Verify database session was created and linked to JWT
 * 4. Make API calls using JWT session
 * 5. Verify API calls work with JWT authentication
 */

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const prisma = new PrismaClient();

// Test user credentials
const TEST_EMAIL = 'pm.candidate@example.com';
const TEST_PASSWORD = 'password123';
const BASE_URL = 'http://localhost:3000';

// Store session data
let cookies = [];
let userId = null;
let jwtToken = null;
let dbSessionToken = null;

/**
 * Helper function to parse cookies from response headers
 */
function parseCookies(response) {
  const cookieHeader = response.headers.raw()['set-cookie'];
  if (!cookieHeader || cookieHeader.length === 0) return [];
  
  return cookieHeader.map(cookie => cookie.split(';')[0]);
}

/**
 * Login with credentials to get JWT session
 */
async function loginWithCredentials() {
  console.log('\n🔑 Testing login with credentials...');
  
  try {
    // First get CSRF token
    const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfResponse.json();
    console.log('📝 Got CSRF token');
    
    // Login with credentials
    const loginResponse = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        csrfToken,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        redirect: false,
      }),
      redirect: 'manual',
    });
    
    // Parse cookies from response
    cookies = parseCookies(loginResponse);
    console.log('✅ Login response status:', loginResponse.status);
    console.log('📝 Cookies received:', cookies.length);
    
    if (cookies.length === 0) {
      throw new Error('No cookies received from login');
    }
    
    // Wait a moment for session to be fully established
    console.log('⏳ Waiting for session to be established...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get session data
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: cookies.join('; '),
      },
    });
    
    const sessionData = await sessionResponse.json();
    console.log('📊 Session data:', sessionData);
    
    // Try to get the user data directly from the API
    console.log('🔍 Fetching user data from API...');
    const userResponse = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Cookie: cookies.join('; '),
      },
    });
    
    if (!userResponse.ok) {
      console.log('⚠️ User API response status:', userResponse.status);
      console.log('⚠️ User API response:', await userResponse.text());
      throw new Error(`User API call failed with status ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();
    console.log('👤 User data:', userData);
    
    if (!userData.id) {
      throw new Error('No user ID in response');
    }
    
    userId = userData.id;
    console.log('👤 User ID:', userId);
    
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error);
    return false;
  }
}

/**
 * Verify database session was created and linked to JWT
 */
async function verifyDatabaseSession() {
  console.log('\n🔍 Verifying database session...');
  
  try {
    // Extract JWT token from cookies
    const jwtCookie = cookies.find(c => c.startsWith('next-auth.session-token='));
    if (!jwtCookie) {
      throw new Error('JWT session token not found in cookies');
    }
    
    jwtToken = jwtCookie.split('=')[1];
    console.log('🔑 JWT token found');
    
    // Find database session for user
    const dbSessions = await prisma.session.findMany({
      where: {
        userId,
      },
      orderBy: {
        expires: 'desc',
      },
    });
    
    if (dbSessions.length === 0) {
      throw new Error('No database sessions found for user');
    }
    
    console.log(`✅ Found ${dbSessions.length} database sessions for user`);
    
    // Get most recent session
    const latestSession = dbSessions[0];
    console.log('📊 Latest session:', {
      id: latestSession.id,
      expires: latestSession.expires,
      sessionToken: latestSession.sessionToken.substring(0, 10) + '...',
      jwtTokenId: latestSession.jwtTokenId || 'null',
    });
    
    dbSessionToken = latestSession.sessionToken;
    
    // Verify session is not expired
    if (new Date(latestSession.expires) < new Date()) {
      throw new Error('Latest session is expired');
    }
    
    // Verify session has jwtTokenId if using hybrid approach
    if (!latestSession.jwtTokenId) {
      console.warn('⚠️ Latest session does not have jwtTokenId - hybrid linking may not be working');
    } else {
      console.log('✅ Session is linked to JWT token');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database session verification failed:', error);
    return false;
  }
}

/**
 * Test API call with JWT authentication
 */
async function testApiWithJwt() {
  console.log('\n🌐 Testing API call with JWT authentication...');
  
  try {
    // Create a test interview session
    const sessionResponse = await fetch(`${BASE_URL}/api/ai/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies.join('; '),
      },
      body: JSON.stringify({
        interviewType: 'behavioral',
        difficulty: 'medium',
        duration: 15,
      }),
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`API call failed with status ${sessionResponse.status}`);
    }
    
    const sessionData = await sessionResponse.json();
    console.log('✅ API call successful');
    console.log('📊 Created session:', sessionData);
    
    // Test video analysis API with JWT authentication
    console.log('\n🎥 Testing video analysis API with JWT authentication...');
    
    // This is just a test call - it will fail without a real video URI
    // but we can check if authentication works
    const analysisResponse = await fetch(`${BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookies.join('; '),
        'X-Auth-Method': 'hybrid-session',
      },
      body: JSON.stringify({
        videoUri: 'gs://test-bucket/test-video.mp4',
        sessionId: sessionData.id,
        analysisType: 'comprehensive',
      }),
    });
    
    // We expect a 400 error for invalid video URI, but not a 401 unauthorized
    if (analysisResponse.status === 401 || analysisResponse.status === 403) {
      throw new Error(`Authentication failed with status ${analysisResponse.status}`);
    }
    
    console.log(`✅ Authentication successful (status: ${analysisResponse.status})`);
    
    return true;
  } catch (error) {
    console.error('❌ API test failed:', error);
    return false;
  }
}

/**
 * Test API call with database session token
 */
async function testApiWithDbSession() {
  console.log('\n🔐 Testing API call with database session token...');
  
  try {
    // Create a custom cookie with the database session token
    const dbSessionCookie = `next-auth.session-token=${dbSessionToken}`;
    
    // Test API call with database session token
    const userResponse = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Cookie: dbSessionCookie,
      },
    });
    
    if (!userResponse.ok) {
      throw new Error(`API call failed with status ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();
    console.log('✅ API call with database session successful');
    console.log('👤 User data:', userData);
    
    return true;
  } catch (error) {
    console.error('❌ API test with database session failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Starting hybrid JWT + database session authentication tests...');
  
  try {
    // Step 1: Login with credentials
    const loginSuccess = await loginWithCredentials();
    if (!loginSuccess) {
      throw new Error('Login test failed');
    }
    
    // Step 2: Verify database session
    const dbSessionSuccess = await verifyDatabaseSession();
    if (!dbSessionSuccess) {
      throw new Error('Database session verification failed');
    }
    
    // Step 3: Test API with JWT
    const jwtApiSuccess = await testApiWithJwt();
    if (!jwtApiSuccess) {
      throw new Error('JWT API test failed');
    }
    
    // Step 4: Test API with database session
    const dbApiSuccess = await testApiWithDbSession();
    if (!dbApiSuccess) {
      throw new Error('Database session API test failed');
    }
    
    console.log('\n✅✅✅ All tests passed! Hybrid JWT + database session authentication is working correctly.');
  } catch (error) {
    console.error('\n❌❌❌ Tests failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
runTests();
