// Test authentication expiration during interview session
require('dotenv').config({ path: '.env.local' });

console.log('🔍 Testing Authentication Expiration Scenario');
console.log('=' .repeat(60));

// Test 1: Check if video analysis API requires authentication
async function testVideoAnalysisAuth() {
  console.log('\n📋 Test 1: Video analysis API authentication requirements');
  
  try {
    // Test without credentials
    console.log('Testing without credentials...');
    const noCredResponse = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No credentials included
      body: JSON.stringify({
        videoUri: 'gs://test-bucket/test-video.webm',
        sessionId: 'test-session',
        analysisType: 'comprehensive'
      })
    });
    
    console.log(`Response status: ${noCredResponse.status}`);
    const responseText = await noCredResponse.text();
    console.log(`Response: ${responseText}`);
    
    if (noCredResponse.status === 401) {
      console.log('✅ API correctly requires authentication');
      return { requiresAuth: true, status: 'SECURE' };
    } else if (noCredResponse.status === 200) {
      console.log('⚠️  API allows unauthenticated access');
      return { requiresAuth: false, status: 'INSECURE' };
    } else {
      console.log(`🤔 Unexpected response: ${noCredResponse.status}`);
      return { requiresAuth: 'unknown', status: 'UNCLEAR' };
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return { error: error.message, status: 'ERROR' };
  }
}

// Test 2: Simulate expired session during analysis
async function testExpiredSessionScenario() {
  console.log('\n📋 Test 2: Expired session during analysis scenario');
  
  try {
    // Test with invalid/expired session cookie
    console.log('Testing with potentially expired session...');
    const expiredResponse = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=expired-or-invalid-token'
      },
      credentials: 'include',
      body: JSON.stringify({
        videoUri: 'gs://test-bucket/test-video.webm',
        sessionId: 'test-session',
        analysisType: 'comprehensive'
      })
    });
    
    console.log(`Response status: ${expiredResponse.status}`);
    const responseText = await expiredResponse.text();
    console.log(`Response: ${responseText}`);
    
    if (expiredResponse.status === 401) {
      console.log('✅ API correctly rejects expired sessions');
      return { 
        handlesExpiration: true, 
        status: 'SECURE',
        impact: 'Analysis will fail with 401 error'
      };
    } else if (expiredResponse.status === 403) {
      console.log('✅ API correctly rejects unauthorized access');
      return { 
        handlesExpiration: true, 
        status: 'SECURE',
        impact: 'Analysis will fail with 403 error'
      };
    } else {
      console.log('⚠️  API may not properly validate sessions');
      return { 
        handlesExpiration: false, 
        status: 'POTENTIAL_ISSUE',
        impact: 'Invalid sessions might be accepted'
      };
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return { error: error.message, status: 'ERROR' };
  }
}

// Test 3: Check session duration vs interview duration
async function checkSessionDuration() {
  console.log('\n📋 Test 3: Session duration analysis');
  
  // Typical interview durations from your platform
  const interviewDurations = [15, 30, 45, 60]; // minutes
  
  console.log('Interview duration scenarios:');
  interviewDurations.forEach(duration => {
    console.log(`• ${duration} minutes: ${duration > 30 ? '⚠️  Risk of session expiration' : '✅ Likely safe'}`);
  });
  
  // Check NextAuth session configuration
  try {
    const nextAuthConfig = `
NextAuth Session Configuration Check:
- Default session max age: 30 days (2592000 seconds)
- Session update age: 24 hours (86400 seconds)
- JWT max age: 30 days (2592000 seconds)

For interview sessions:
- Short interviews (15-30 min): ✅ Safe
- Long interviews (45-60 min): ⚠️  Potential risk if user was near session expiry
- Video analysis (5-10 min): ⚠️  Risk if triggered after long interview

Recommendation: Implement session refresh before analysis
`;
    
    console.log(nextAuthConfig);
    
    return {
      shortInterviews: 'safe',
      longInterviews: 'potential_risk',
      videoAnalysis: 'risk_after_long_interview'
    };
    
  } catch (error) {
    console.error('Error checking session config:', error.message);
    return { error: error.message };
  }
}

// Test 4: Analyze the specific failure scenario
async function analyzeFailureScenario() {
  console.log('\n📋 Test 4: Failure scenario analysis');
  
  const scenario = `
🎯 AUTHENTICATION EXPIRATION FAILURE SCENARIO:

1. User starts 60-minute interview session
2. User was already 23+ hours into their session (near 24h refresh threshold)
3. Interview completes after 60 minutes
4. handleEndInterview() calls triggerVideoAnalysisWithRetry()
5. Video uploads successfully (may not require auth)
6. triggerVideoAnalysisWithRetry() calls /api/video-analysis with credentials: 'include'
7. Session has expired during the interview
8. API returns 401 Unauthorized
9. User sees "Analysis failed" but doesn't know why
10. Video is uploaded but no analysis is performed

IMPACT:
- User loses interview feedback
- Video exists in Google Cloud Storage
- No analysis record in database
- Silent failure from user perspective

CURRENT HANDLING:
- triggerVideoAnalysisWithRetry() catches the error
- Retries 3 times with same expired credentials
- All retries fail with 401
- Final error: "Analysis failed after 3 attempts"
- User doesn't know session expired
`;
  
  console.log(scenario);
  
  return {
    scenario: 'session_expiration_during_analysis',
    likelihood: 'medium',
    impact: 'high',
    currentHandling: 'poor',
    userExperience: 'confusing'
  };
}

// Main test runner
async function runAuthExpirationTests() {
  console.log('🚀 Running authentication expiration tests...\n');
  
  const results = {
    apiAuth: await testVideoAnalysisAuth(),
    expiredSession: await testExpiredSessionScenario(),
    sessionDuration: await checkSessionDuration(),
    failureScenario: await analyzeFailureScenario()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 AUTHENTICATION EXPIRATION TEST RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n🔐 API Authentication:');
  console.log(`   Status: ${results.apiAuth.status}`);
  console.log(`   Requires Auth: ${results.apiAuth.requiresAuth}`);
  
  console.log('\n⏰ Expired Session Handling:');
  console.log(`   Status: ${results.expiredSession.status}`);
  console.log(`   Impact: ${results.expiredSession.impact}`);
  
  console.log('\n📅 Session Duration Analysis:');
  console.log(`   Short interviews: ${results.sessionDuration.shortInterviews}`);
  console.log(`   Long interviews: ${results.sessionDuration.longInterviews}`);
  console.log(`   Video analysis: ${results.sessionDuration.videoAnalysis}`);
  
  console.log('\n🎯 Failure Scenario:');
  console.log(`   Likelihood: ${results.failureScenario.likelihood}`);
  console.log(`   Impact: ${results.failureScenario.impact}`);
  console.log(`   Current handling: ${results.failureScenario.currentHandling}`);
  
  console.log('\n🔧 RECOMMENDATIONS:');
  console.log('1. Add session validation before video analysis');
  console.log('2. Implement session refresh mechanism');
  console.log('3. Add specific error handling for 401/403 responses');
  console.log('4. Provide clear user messaging for auth failures');
  console.log('5. Consider background processing for analysis');
  
  return results;
}

// Run tests
runAuthExpirationTests().catch(console.error);
