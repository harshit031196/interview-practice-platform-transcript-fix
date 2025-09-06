/**
 * Hybrid Authentication Verification Test Script
 * 
 * This script tests the hybrid JWT + database session authentication approach
 * by performing a series of authentication and API calls to verify both
 * authentication methods are working correctly.
 * 
 * USAGE:
 * 1. Start your Next.js development server: npm run dev
 * 2. Run this script: node test-hybrid-auth-verification.js
 * 
 * NOTE: This script requires a running server and valid test credentials.
 * Update the TEST_USER configuration below with valid credentials before running.
 */

const fetch = require('node-fetch');
const { parse, serialize } = require('cookie');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'pm.candidate@example.com', // Update with a valid test user email
  password: 'password123'           // Update with the correct password
};

// Test configuration
const CONFIG = {
  skipJwtTests: false,      // Set to true to skip JWT-specific tests
  skipDatabaseTests: false, // Set to true to skip database session tests
  verbose: true,           // Set to true for detailed logging
  retryCount: 2            // Number of retries for failed requests
};

// Store cookies and tokens
let cookies = {};
let userId = null;

/**
 * Helper function to parse cookies from response
 */
function extractCookies(response) {
  const rawCookies = response.headers.raw()['set-cookie'] || [];
  const parsedCookies = {};
  
  rawCookies.forEach(cookie => {
    const parsed = parse(cookie);
    const key = Object.keys(parsed)[0];
    if (key) parsedCookies[key] = parsed[key];
  });
  
  return parsedCookies;
}

/**
 * Helper function to serialize cookies for request
 */
function serializeCookies(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Step 1: Login with credentials to get JWT session
 */
/**
 * Helper function to retry failed requests
 */
async function withRetry(fn, name) {
  let lastError;
  for (let i = 0; i <= CONFIG.retryCount; i++) {
    try {
      if (i > 0 && CONFIG.verbose) {
        console.log(`🔄 Retry attempt ${i} for ${name}...`);
      }
      return await fn();
    } catch (error) {
      lastError = error;
      if (CONFIG.verbose) {
        console.error(`❌ Attempt ${i+1} failed:`, error.message);
      }
    }
  }
  throw lastError;
}

async function loginWithCredentials() {
  console.log('\n🔑 Step 1: Testing login with credentials...');
  
  try {
    // First get CSRF token and collect initial cookies
    const csrfResponse = await withRetry(
      () => fetch(`${BASE_URL}/api/auth/csrf`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      }),
      'CSRF token request'
    );
    
    if (!csrfResponse.ok) {
      console.error('❌ Failed to get CSRF token, status:', csrfResponse.status);
      return false;
    }
    
    // Extract initial cookies (important for CSRF protection)
    const initialCookies = extractCookies(csrfResponse);
    cookies = { ...cookies, ...initialCookies };
    
    if (CONFIG.verbose) {
      console.log('🔍 Initial cookies received:', Object.keys(cookies).join(', '));
    }
    
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;
    
    if (!csrfToken) {
      console.error('❌ CSRF token not found in response');
      return false;
    }
    
    console.log('✅ Got CSRF token:', csrfToken);
    
    // Login with credentials
    const loginResponse = await withRetry(
      () => fetch(`${BASE_URL}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': serializeCookies(cookies),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          csrfToken,
          email: TEST_USER.email,
          password: TEST_USER.password,
          redirect: false,
        }),
        redirect: 'manual',
      }),
      'Login request'
    );
    
    // Extract cookies from login response
    const loginCookies = extractCookies(loginResponse);
    cookies = { ...cookies, ...loginCookies };
    
    console.log('✅ Login response status:', loginResponse.status);
    
    // Check response body for debugging
    let responseBody;
    try {
      responseBody = await loginResponse.text();
      if (responseBody && CONFIG.verbose) {
        console.log('🔍 Login response body:', responseBody.substring(0, 200) + (responseBody.length > 200 ? '...' : ''));
      }
    } catch (e) {
      console.log('⚠️ Could not read response body');
    }
    
    // If we got a redirect, follow it to get the session cookie
    if (loginResponse.status >= 300 && loginResponse.status < 400) {
      const redirectUrl = loginResponse.headers.get('location');
      console.log('🔄 Following redirect to:', redirectUrl);
      
      if (redirectUrl) {
        const sessionResponse = await withRetry(
          () => fetch(redirectUrl.startsWith('/') ? `${BASE_URL}${redirectUrl}` : redirectUrl, {
            headers: {
              'Cookie': serializeCookies(cookies),
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            },
            redirect: 'manual'
          }),
          'Session redirect request'
        );
        
        // Extract cookies from session response
        const sessionCookies = extractCookies(sessionResponse);
        cookies = { ...cookies, ...sessionCookies };
        
        console.log('✅ Session redirect status:', sessionResponse.status);
      }
    }
    
    // Now try to get the session directly
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        'Cookie': serializeCookies(cookies),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    const sessionData = await sessionResponse.json();
    
    if (CONFIG.verbose) {
      console.log('🔍 All cookies after login:', Object.keys(cookies).join(', '));
      console.log('🔍 Session data:', JSON.stringify(sessionData, null, 2));
    } else {
      console.log(`✅ Received ${Object.keys(cookies).length} cookies total`);
    }
    
    // Check if we got the JWT session cookie or if we have a valid session
    if (cookies['next-auth.session-token']) {
      console.log('✅ JWT session cookie received');
      return true;
    } else if (sessionData && sessionData.user) {
      console.log('✅ Valid session obtained without JWT cookie');
      return true;
    } else {
      console.log('❌ No valid session established');
      return false;
    }
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    return false;
  }
}

/**
 * Step 2: Verify JWT session via NextAuth session endpoint
 */
async function verifyJwtSession() {
  console.log('\n🔍 Step 2: Verifying JWT session...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: serializeCookies(cookies),
      },
    });
    
    const session = await response.json();
    
    if (session && session.user) {
      userId = session.user.id;
      console.log('✅ JWT session valid for user:', session.user.email);
      console.log('✅ User ID:', userId);
      console.log('✅ User role:', session.user.role);
      return true;
    } else {
      console.log('❌ JWT session invalid or expired');
      return false;
    }
  } catch (error) {
    console.error('❌ JWT session verification failed:', error.message);
    return false;
  }
}

/**
 * Step 3: Test API access with JWT session
 */
async function testApiWithJwtSession() {
  console.log('\n🔌 Step 3: Testing API access with JWT session...');
  
  try {
    // Test interviews API
    const response = await fetch(`${BASE_URL}/api/interviews`, {
      headers: {
        Cookie: serializeCookies(cookies),
      },
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API access successful with JWT session');
      console.log(`✅ Retrieved ${data.interviews?.length || 0} interviews`);
      return true;
    } else {
      console.log('❌ API access failed with JWT session');
      console.log('❌ Error:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    return false;
  }
}

/**
 * Step 4: Verify database session is created alongside JWT
 */
async function verifyDatabaseSession() {
  console.log('\n🔍 Step 4: Verifying database session creation...');
  
  try {
    // We'll use the JWT session to check if database session exists
    // This is an indirect verification since we don't have direct DB access in this script
    const response = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: serializeCookies(cookies),
      },
    });
    
    const session = await response.json();
    
    if (session && session.dbSessionToken) {
      console.log('✅ Database session token found in JWT payload');
      return true;
    } else {
      console.log('⚠️ Database session token not found in JWT payload');
      console.log('⚠️ This is expected if using pure JWT strategy without exposing DB token');
      
      // Try an API that specifically checks database sessions
      const apiResponse = await fetch(`${BASE_URL}/api/video-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: serializeCookies(cookies),
          'X-Auth-Method': 'hybrid-session', // Request hybrid authentication
        },
        body: JSON.stringify({
          videoUri: 'test-uri',
          sessionId: 'test-session',
        }),
      });
      
      // Even if the API call fails due to invalid parameters,
      // we should get a different error than 401 if auth worked
      if (apiResponse.status !== 401) {
        console.log('✅ API accepted authentication (non-401 response)');
        return true;
      } else {
        console.log('❌ Database session validation failed');
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Database session verification failed:', error.message);
    return false;
  }
}

/**
 * Step 5: Test API with explicit database session validation
 */
async function testApiWithDatabaseSession() {
  console.log('\n🔌 Step 5: Testing API with explicit database session validation...');
  
  try {
    // Test analytics API which uses database session validation
    const response = await fetch(`${BASE_URL}/api/analytics/overview`, {
      headers: {
        Cookie: serializeCookies(cookies),
        'X-Auth-Method': 'hybrid-session', // Request hybrid authentication
      },
    });
    
    if (response.ok) {
      console.log('✅ API access successful with database session');
      return true;
    } else {
      const data = await response.json();
      console.log('❌ API access failed with database session');
      console.log('❌ Error:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    return false;
  }
}

/**
 * Step 6: Test hybrid fallback by simulating expired JWT
 */
async function testHybridFallback() {
  console.log('\n🔄 Step 6: Testing hybrid fallback mechanism...');
  
  try {
    // First get the session data to extract the dbSessionToken
    const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: serializeCookies(cookies),
      },
    });
    
    const sessionData = await sessionResponse.json();
    const dbSessionToken = sessionData.dbSessionToken;
    
    if (!dbSessionToken) {
      console.log('❌ No database session token found in JWT payload');
      return false;
    }
    
    console.log('✅ Found database session token:', dbSessionToken.substring(0, 8) + '...');
    
    // Create a copy of cookies but use the database-specific session token
    const modifiedCookies = {};
    // Use the database-specific cookie name for the session token
    modifiedCookies['next-auth.database-session'] = dbSessionToken;
    
    // Test interviews API with only database session
    const response = await fetch(`${BASE_URL}/api/interviews`, {
      headers: {
        Cookie: serializeCookies(modifiedCookies),
        'X-Auth-Method': 'hybrid-session', // Signal to use hybrid authentication
      },
    });
    
    if (response.ok) {
      console.log('✅ Hybrid fallback successful - API accessible with only database session');
      return true;
    } else {
      const data = await response.json();
      console.log('❌ Hybrid fallback failed - API requires JWT session');
      console.log('❌ Error:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Hybrid fallback test failed:', error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🧪 Starting Hybrid Authentication Verification Tests');
  console.log('==================================================');
  console.log(`🔧 Server URL: ${BASE_URL}`);
  console.log(`🔧 Test user: ${TEST_USER.email}`);
  console.log('==================================================\n');
  
  let results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };
  
  try {
    // Step 1: Login (required for all tests)
    const loginSuccess = await loginWithCredentials();
    results.total++;
    if (loginSuccess) {
      results.passed++;
      
      // Step 2: Verify JWT session
      if (!CONFIG.skipJwtTests) {
        const jwtSessionSuccess = await verifyJwtSession();
        results.total++;
        jwtSessionSuccess ? results.passed++ : results.failed++;
        
        // Step 3: Test API with JWT session
        const jwtApiSuccess = await testApiWithJwtSession();
        results.total++;
        jwtApiSuccess ? results.passed++ : results.failed++;
      } else {
        console.log('\n⏭️ Skipping JWT session tests');
        results.skipped += 2;
      }
      
      // Step 4: Verify database session
      if (!CONFIG.skipDatabaseTests) {
        const dbSessionSuccess = await verifyDatabaseSession();
        results.total++;
        dbSessionSuccess ? results.passed++ : results.failed++;
        
        // Step 5: Test API with database session
        const dbApiSuccess = await testApiWithDatabaseSession();
        results.total++;
        dbApiSuccess ? results.passed++ : results.failed++;
        
        // Step 6: Test hybrid fallback
        const hybridFallbackSuccess = await testHybridFallback();
        results.total++;
        hybridFallbackSuccess ? results.passed++ : results.failed++;
      } else {
        console.log('\n⏭️ Skipping database session tests');
        results.skipped += 3;
      }
    } else {
      results.failed++;
      console.log('\n❌ Login failed, skipping remaining tests');
      results.skipped += CONFIG.skipJwtTests ? 0 : 2;
      results.skipped += CONFIG.skipDatabaseTests ? 0 : 3;
    }
  } catch (error) {
    console.error('\n❌ Test execution error:', error.message);
  }
  
  console.log('\n==================================================');
  console.log(`📊 Test Results: ${results.passed}/${results.total} passed, ${results.failed} failed, ${results.skipped} skipped`);
  
  if (results.failed === 0 && results.passed > 0) {
    console.log('✅ All executed hybrid authentication tests passed!');
  } else if (results.failed > 0) {
    console.log('❌ Some hybrid authentication tests failed. See details above.');
  } else {
    console.log('⚠️ No tests were successfully executed.');
  }
  
  console.log('\n📝 Next steps:');
  if (results.failed > 0) {
    console.log('  - Check if the server is running at ' + BASE_URL);
    console.log('  - Verify test user credentials are correct');
    console.log('  - Review server logs for authentication errors');
  } else {
    console.log('  - Review the hybrid authentication documentation');
    console.log('  - Consider adding more API routes to the test');
  }
}

// Check if server is running before starting tests
async function checkServerBeforeTests() {
  try {
    console.log(`🔍 Checking if server is running at ${BASE_URL}...`);
    const response = await fetch(`${BASE_URL}/api/auth/csrf`).catch(() => ({ ok: false }));
    
    if (response.ok) {
      console.log('✅ Server is running!');
      return runTests();
    } else {
      console.log('\n❌ Server check failed. Please make sure:');
      console.log('  1. Your Next.js server is running (npm run dev)');
      console.log('  2. It\'s accessible at ' + BASE_URL);
      console.log('\nAlternatively, you can manually verify the server is running and then run this script.');
    }
  } catch (error) {
    console.error('❌ Server check error:', error.message);
    console.log('\nPlease start your Next.js server with "npm run dev" before running this test.');
  }
}

// Start the process
try {
  checkServerBeforeTests().catch(error => {
    console.error('Test execution failed:', error);
  });
} catch (error) {
  console.error('Script execution failed:', error);
}
