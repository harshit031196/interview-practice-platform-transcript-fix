/**
 * End-to-end test script for authentication flow and video analysis
 * 
 * This script tests:
 * 1. Login with credentials
 * 2. Session creation in database
 * 3. Video analysis API call with database session
 * 
 * Usage: node test-auth-flow.js
 */

const axios = require('axios');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Initialize Prisma client
const prisma = new PrismaClient();

// Test configuration
const TEST_EMAIL = 'test@example.com'; // Our newly created test user
const TEST_PASSWORD = 'password123';
const TEST_VIDEO_URI = 'gs://interview-recordings-dev/test-video.webm';
const BASE_URL = 'http://localhost:3000';

// Helper function to log with timestamp
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Helper function to login and get session
async function loginWithCredentials(email, password) {
  try {
    log(`Attempting to login with email: ${email}`);
    
    // Step 1: Get CSRF token
    log('Getting CSRF token...');
    const csrfResponse = await fetch(`${BASE_URL}/api/auth/csrf`, {
      method: 'GET',
    });
    
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.csrfToken;
    log(`CSRF token obtained: ${csrfToken}`);
    
    // Step 2: Sign in with credentials using the proper NextAuth credentials endpoint
    // This matches how the frontend does it with signIn('credentials', {...})
    log('Signing in with credentials...');
    const signInResponse = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        redirect: 'false',
        callbackUrl: `${BASE_URL}/dashboard`,
        json: 'true'
      }),
      redirect: 'manual',
      credentials: 'include', // Important: include credentials to store cookies
    });

    log(`Login response status: ${signInResponse.status}`);
    
    // Extract cookies from response
    const cookies = signInResponse.headers.get('set-cookie');
    log(`Cookies received: ${cookies ? 'Yes' : 'No'}`);
    
    // Implement exponential backoff for session check, similar to frontend
    let session = null;
    let retries = 0;
    const maxRetries = 8;
    let allCookies = cookies || '';
    
    while (!session && retries < maxRetries) {
      const delay = Math.min(200 * Math.pow(1.5, retries), 2000); // Exponential backoff with 2s max
      log(`Waiting ${delay}ms for session (attempt ${retries + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Check session
      const sessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
        headers: {
          Cookie: allCookies,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        credentials: 'include',
      });
      
      // Update cookies if we get new ones
      const newCookies = sessionResponse.headers.get('set-cookie');
      if (newCookies) {
        allCookies = newCookies;
        log('Received new cookies from session endpoint');
      }
      
      const sessionData = await sessionResponse.json();
      log(`Session data (attempt ${retries + 1}): ${JSON.stringify(sessionData)}`);
      
      if (sessionData && sessionData.user) {
        session = sessionData;
        break;
      }
      
      // If we've tried a few times and still no session, check if we should use direct session creation
      const USE_DIRECT_SESSION_FALLBACK = process.env.USE_DIRECT_SESSION_FALLBACK === 'true';
      
      if (retries === 3 && USE_DIRECT_SESSION_FALLBACK) {
        log('Attempting direct session creation as fallback...');
        try {
          const directSessionResponse = await fetch(`${BASE_URL}/api/auth/create-direct-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: allCookies
            },
            body: JSON.stringify({ email: TEST_EMAIL }),
            credentials: 'include',
          });
          
          if (directSessionResponse.ok) {
            log('Direct session creation succeeded');
            
            // Get the new cookies with session token
            const directSessionCookies = directSessionResponse.headers.get('set-cookie');
            if (directSessionCookies) {
              allCookies = directSessionCookies;
              log('Received new cookies from direct session creation');
            }
            
            // Check session again
            const finalSessionResponse = await fetch(`${BASE_URL}/api/auth/session`, {
              headers: {
                Cookie: allCookies,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
              },
              credentials: 'include',
            });
            
            const finalSessionData = await finalSessionResponse.json();
            log(`Final session data after direct creation: ${JSON.stringify(finalSessionData)}`);
            
            if (finalSessionData && finalSessionData.user) {
              session = finalSessionData;
              break;
            }
          } else {
            log(`Direct session creation failed: ${directSessionResponse.status}`);
          }
        } catch (directSessionError) {
          log(`Error in direct session creation: ${directSessionError.message}`);
        }
      } else if (retries === 3) {
        log('Skipping direct session creation fallback - testing NextAuth session creation only');
      }
      
      retries++;
    }
    
    if (!session) {
      log('Session creation failed after multiple retries');
      return null;
    }
    
    // Extract session token from cookies
    const sessionToken = extractSessionToken(allCookies);
    
    log(`Session found for user: ${session.user?.email}`);
    return { 
      sessionToken, 
      cookies: allCookies, 
      userId: session.user?.id,
      sessionData: session 
    };
  } catch (error) {
    log(`Login error: ${error.message}`);
    return null;
  }
}

// Helper function to create a test interview session
async function createInterviewSession(userId, cookies) {
  log('Creating test interview session');
  
  try {
    const response = await fetch(`${BASE_URL}/api/ai/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || '',
      },
      body: JSON.stringify({
        interviewType: 'Product Manager',
        difficulty: 'MEDIUM',
        duration: 15,
        isConversational: false
      }),
    });
    
    if (!response.ok) {
      log(`Failed to create interview session: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    log(`Created interview session with ID: ${data.sessionId}`);
    return { id: data.sessionId };
  } catch (error) {
    log(`Error creating interview session: ${error.message}`);
    return null;
  }
}

// Helper function to extract session token from cookies
function extractSessionToken(cookies) {
  if (!cookies) return null;
  
  const sessionTokenMatch = cookies.match(/next-auth\.session-token=([^;]+)/);
  return sessionTokenMatch ? sessionTokenMatch[1] : null;
}

// Helper function to check session data
async function checkSession(cookies) {
  try {
    log('Checking session data');
    
    const response = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: {
        Cookie: cookies || '',
      },
    });
    
    if (!response.ok) {
      log(`Session check failed with status: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (!data || Object.keys(data).length === 0) {
      log('Session check returned empty data');
      return null;
    }
    
    return data;
  } catch (error) {
    log(`Error checking session: ${error.message}`);
    return null;
  }
}

// Helper function to create a session directly in the database
async function createDirectDatabaseSession(userId) {
  try {
    // Generate a random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiry (30 days from now)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    log(`Creating direct database session for user ID: ${userId}`);
    log(`Session token: ${sessionToken.substring(0, 10)}...`);
    log(`Expires: ${expires.toISOString()}`);
    
    // Create the session in the database
    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
      },
    });
    
    log(`Session created with ID: ${session.id}`);
    return { session, sessionToken };
  } catch (error) {
    log(`Error creating direct database session: ${error.message}`);
    return null;
  }
}

// Helper function to test video analysis API with session cookie
async function testVideoAnalysis(sessionToken, sessionId) {
  log('Testing video analysis API with database session');
  
  try {
    const response = await fetch(`${BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${sessionToken}`,
        'X-Auth-Method': 'database-session'
      },
      body: JSON.stringify({
        videoUri: TEST_VIDEO_URI,
        sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    log(`Video analysis response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      log(`Video analysis error: ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    log('Video analysis successful');
    return true;
  } catch (error) {
    log(`Video analysis error: ${error.message}`);
    return false;
  }
}

// Helper function to check database for valid session
async function checkDatabaseSession(userId) {
  log(`Checking database for sessions for user ID: ${userId}`);
  
  try {
    // Find the user first
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      log(`User with ID ${userId} not found in database`);
      return null;
    }
    
    log(`Found user with ID: ${user.id}`);
    
    // Find sessions for this user
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { expires: 'desc' },
    });
    
    if (sessions.length === 0) {
      log('No sessions found for this user');
      return null;
    }
    
    log(`Found ${sessions.length} sessions for user`);
    sessions.forEach((session, index) => {
      log(`Session ${index + 1}: ID=${session.id}, Expires=${session.expires}`);
    });
    
    return { user, sessions };
  } catch (error) {
    log(`Error checking database sessions: ${error.message}`);
    return null;
  }
}

// Main test function
async function testAuthFlow() {
  try {
    log('Starting authentication flow test');
    
    // Step 1: Login with credentials
    const loginResult = await loginWithCredentials(TEST_EMAIL, TEST_PASSWORD);
    
    if (!loginResult) {
      log('❌ Login failed completely');
      process.exit(1);
    }
    
    const { cookies, sessionData } = loginResult;
    
    if (!cookies) {
      log('❌ No cookies received from login');
      process.exit(1);
    }
    
    // Extract session token from cookies
    const sessionToken = extractSessionToken(cookies);
    if (!sessionToken) {
      log('⚠️ No session token found in cookies');
    } else {
      log(`✅ Session token extracted: ${sessionToken.substring(0, 10)}...`);
    }
    
    // Check if session data is available
    if (!sessionData || !sessionData.user) {
      log('❌ NextAuth login failed to create a valid session');
      log('Checking database for session records...');
      
      // Check if a session was created in the database despite not being in the API response
      const dbSession = await checkDatabaseSession(TEST_EMAIL);
      if (dbSession) {
        log(`⚠️ Found database session but NextAuth API didn't return it: ${dbSession.id}`);
      } else {
        log('❌ No database session found either');
      }
      
      log('❌ Authentication flow test failed: NextAuth session creation issue');
      process.exit(1);
    } else {
      log(`✅ NextAuth login successful for user: ${sessionData.user.email}`);
      
      const userId = sessionData.user.id;
      
      // Step 3: Create interview session
      const interviewSession = await createInterviewSession(userId, cookies);
      if (!interviewSession) {
        log('❌ Failed to create interview session');
        return;
      }
      
      log(`✅ Interview session created: ${interviewSession.id}`);
      
      // Step 4: Test video analysis API
      const videoAnalysisResult = await testVideoAnalysis(sessionToken, interviewSession.id);
      if (!videoAnalysisResult) {
        log('❌ Video analysis failed');
        return;
      }
      
      log(`✅ Video analysis successful`);
      log('✅ Authentication flow test completed successfully');
      
      // Step 5: Check database for session
      await checkDatabaseSession(userId);
    }
  } catch (error) {
    log(`Test error: ${error.message}`);
    log('❌ Authentication flow test failed');
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testAuthFlow();
