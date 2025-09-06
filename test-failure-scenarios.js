// Test script to check each potential failure scenario
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Test configuration
const TEST_SESSION_ID = 'cmey4selz0001lmf51wurzdhz';
const TEST_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey4selz0001lmf51wurzdhz/1756550509028_interview_cmey4selz0001lmf51wurzdhz_1756550508387.webm';
const API_SECRET_KEY = process.env.API_SECRET_KEY;

console.log('🔍 Testing Failure Scenarios for Interview Platform\n');

// Scenario 1: User closed interview before handleEndInterview completed
async function testScenario1() {
  console.log('📋 SCENARIO 1: User closed interview before handleEndInterview completed');
  console.log('=' .repeat(70));
  
  try {
    // Check if session exists and its current state
    const session = await prisma.interviewSession.findUnique({
      where: { id: TEST_SESSION_ID },
      include: { 
        recording: true,
        feedback: true
      }
    });
    
    if (!session) {
      console.log('❌ Session not found - this would be a critical failure');
      return { status: 'CRITICAL', issue: 'Session does not exist' };
    }
    
    console.log(`✅ Session found: ${session.id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Created: ${session.createdAt}`);
    console.log(`   Ended: ${session.endedAt || 'Not ended'}`);
    
    // Check if recording exists
    if (!session.recording) {
      console.log('⚠️  No recording found - video upload was interrupted');
      return { 
        status: 'FAILURE', 
        issue: 'Video upload interrupted - no recording in database',
        impact: 'User loses entire interview session'
      };
    }
    
    console.log(`✅ Recording exists: ${session.recording.url}`);
    
    // Check if video analysis exists (separate table)
    const videoAnalysis = await prisma.videoAnalysis.findMany({
      where: { sessionId: session.id }
    });
    
    if (!videoAnalysis || videoAnalysis.length === 0) {
      console.log('⚠️  No video analysis found - analysis was not triggered');
      return { 
        status: 'PARTIAL_FAILURE', 
        issue: 'Video uploaded but analysis not triggered',
        impact: 'Video exists but no feedback available'
      };
    }
    
    console.log(`✅ Video analysis exists: ${videoAnalysis.length} records`);
    
    return { status: 'SUCCESS', issue: 'None detected' };
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return { status: 'ERROR', issue: `Database error: ${error.message}` };
  }
}

// Scenario 2: Authentication expired during interview session
async function testScenario2() {
  console.log('\n📋 SCENARIO 2: Authentication expired during interview session');
  console.log('=' .repeat(70));
  
  try {
    // Test API call without proper authentication
    console.log('Testing video analysis API without credentials...');
    
    const response = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Intentionally omit credentials and API key
      body: JSON.stringify({
        videoUri: TEST_VIDEO_URI,
        sessionId: TEST_SESSION_ID,
        analysisType: 'comprehensive'
      })
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('✅ Authentication properly rejected');
      return { 
        status: 'EXPECTED_FAILURE', 
        issue: 'Authentication required - API correctly rejects unauthenticated requests',
        impact: 'Analysis fails silently in browser context'
      };
    } else if (response.status === 403) {
      console.log('✅ Authorization properly rejected');
      return { 
        status: 'EXPECTED_FAILURE', 
        issue: 'Authorization required - API correctly rejects unauthorized requests',
        impact: 'Analysis fails silently in browser context'
      };
    } else {
      console.log('⚠️  Unexpected response - authentication may not be properly enforced');
      const responseText = await response.text();
      console.log('Response:', responseText);
      return { 
        status: 'SECURITY_ISSUE', 
        issue: 'API may not properly enforce authentication',
        impact: 'Potential security vulnerability'
      };
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return { status: 'NETWORK_ERROR', issue: `Network error: ${error.message}` };
  }
}

// Scenario 3: Network timeout during analysis trigger step
async function testScenario3() {
  console.log('\n📋 SCENARIO 3: Network timeout during analysis trigger step');
  console.log('=' .repeat(70));
  
  try {
    console.log('Testing video analysis with short timeout...');
    
    // Create a timeout promise (very short timeout to simulate failure)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Analysis timeout')), 1000) // 1 second timeout
    );
    
    // Create analysis promise
    const analysisPromise = fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': API_SECRET_KEY
      },
      body: JSON.stringify({
        videoUri: TEST_VIDEO_URI,
        sessionId: TEST_SESSION_ID,
        analysisType: 'comprehensive'
      })
    });

    try {
      // Race between analysis and timeout
      const response = await Promise.race([analysisPromise, timeoutPromise]);
      console.log('⚠️  Analysis completed faster than expected timeout');
      return { 
        status: 'UNEXPECTED_SUCCESS', 
        issue: 'Analysis completed within timeout window',
        impact: 'Timeout scenario not reproducible with current setup'
      };
    } catch (timeoutError) {
      if (timeoutError.message === 'Analysis timeout') {
        console.log('✅ Timeout scenario reproduced');
        
        // Check if the original request is still processing
        setTimeout(async () => {
          try {
            const originalResponse = await analysisPromise;
            console.log('⚠️  Original request completed after timeout:', originalResponse.status);
          } catch (e) {
            console.log('✅ Original request also failed:', e.message);
          }
        }, 5000);
        
        return { 
          status: 'TIMEOUT_FAILURE', 
          issue: 'Network timeout during analysis trigger',
          impact: 'User sees timeout error but analysis may continue in background'
        };
      }
      throw timeoutError;
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    return { status: 'TEST_ERROR', issue: `Test error: ${error.message}` };
  }
}

// Scenario 4: Silent failure in triggerVideoAnalysisWithRetry function
async function testScenario4() {
  console.log('\n📋 SCENARIO 4: Silent failure in triggerVideoAnalysisWithRetry function');
  console.log('=' .repeat(70));
  
  try {
    // Simulate the retry logic with invalid data
    console.log('Testing retry logic with invalid video URI...');
    
    const invalidVideoUri = 'gs://invalid-bucket/invalid/path/video.webm';
    let attempt = 1;
    const maxRetries = 3;
    
    while (attempt <= maxRetries) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}...`);
        
        const response = await fetch('http://localhost:3000/api/video-analysis', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-api-key': API_SECRET_KEY
          },
          body: JSON.stringify({
            videoUri: invalidVideoUri,
            sessionId: TEST_SESSION_ID,
            analysisType: 'comprehensive'
          })
        });
        
        console.log(`Response status: ${response.status}`);
        
        if (response.ok) {
          console.log('⚠️  Unexpected success with invalid URI');
          return { 
            status: 'UNEXPECTED_SUCCESS', 
            issue: 'Invalid video URI was accepted',
            impact: 'Validation may be insufficient'
          };
        } else {
          const errorText = await response.text();
          console.log(`❌ Attempt ${attempt} failed: ${response.status} - ${errorText}`);
          
          if (attempt === maxRetries) {
            console.log('✅ All retries exhausted as expected');
            return { 
              status: 'EXPECTED_FAILURE', 
              issue: 'Retry logic works correctly - all attempts failed',
              impact: 'User gets proper error message after retries'
            };
          }
          
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempt} error:`, error.message);
        
        if (attempt === maxRetries) {
          return { 
            status: 'NETWORK_FAILURE', 
            issue: 'Network errors during all retry attempts',
            impact: 'Complete failure - no analysis possible'
          };
        }
      }
      
      attempt++;
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
    return { status: 'TEST_ERROR', issue: `Test error: ${error.message}` };
  }
}

// Scenario 5: Session state and database constraint issues
async function testScenario5() {
  console.log('\n📋 SCENARIO 5: Session state and database constraint issues');
  console.log('=' .repeat(70));
  
  try {
    // Check for orphaned records
    console.log('Checking for orphaned video analysis records...');
    
    const orphanedAnalysis = await prisma.videoAnalysis.findMany({
      where: {
        sessionId: {
          notIn: (await prisma.interviewSession.findMany({ select: { id: true } })).map(s => s.id)
        }
      }
    });
    
    if (orphanedAnalysis.length > 0) {
      console.log(`⚠️  Found ${orphanedAnalysis.length} orphaned video analysis records`);
    } else {
      console.log('✅ No orphaned video analysis records found');
    }
    
    // Check for sessions without recordings
    console.log('Checking for sessions without recordings...');
    
    const sessionsWithoutRecordings = await prisma.interviewSession.findMany({
      where: {
        recording: null,
        status: 'COMPLETED'
      }
    });
    
    if (sessionsWithoutRecordings.length > 0) {
      console.log(`⚠️  Found ${sessionsWithoutRecordings.length} completed sessions without recordings`);
      sessionsWithoutRecordings.forEach(session => {
        console.log(`   - Session ${session.id}: ${session.status} (${session.createdAt})`);
      });
    } else {
      console.log('✅ All completed sessions have recordings');
    }
    
    // Check for duplicate analysis records
    console.log('Checking for duplicate analysis records...');
    
    const duplicateAnalysis = await prisma.$queryRaw`
      SELECT "sessionId", COUNT(*) as count 
      FROM "video_analysis" 
      GROUP BY "sessionId" 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateAnalysis.length > 0) {
      console.log(`⚠️  Found ${duplicateAnalysis.length} sessions with duplicate analysis records`);
      duplicateAnalysis.forEach(dup => {
        console.log(`   - Session ${dup.sessionId}: ${dup.count} analysis records`);
      });
    } else {
      console.log('✅ No duplicate analysis records found');
    }
    
    return { 
      status: 'ANALYSIS_COMPLETE', 
      issue: 'Database integrity check completed',
      orphanedRecords: orphanedAnalysis.length,
      sessionsWithoutRecordings: sessionsWithoutRecordings.length,
      duplicateAnalysis: duplicateAnalysis.length
    };
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return { status: 'DATABASE_ERROR', issue: `Database error: ${error.message}` };
  }
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting comprehensive failure scenario testing...\n');
  
  const results = {
    scenario1: await testScenario1(),
    scenario2: await testScenario2(),
    scenario3: await testScenario3(),
    scenario4: await testScenario4(),
    scenario5: await testScenario5()
  };
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 FAILURE SCENARIO TEST RESULTS');
  console.log('='.repeat(70));
  
  Object.entries(results).forEach(([scenario, result]) => {
    const statusIcon = {
      'SUCCESS': '✅',
      'EXPECTED_FAILURE': '✅',
      'PARTIAL_FAILURE': '⚠️ ',
      'FAILURE': '❌',
      'CRITICAL': '🚨',
      'SECURITY_ISSUE': '🔒',
      'TIMEOUT_FAILURE': '⏰',
      'NETWORK_ERROR': '🌐',
      'TEST_ERROR': '🧪',
      'DATABASE_ERROR': '💾'
    }[result.status] || '❓';
    
    console.log(`${statusIcon} ${scenario.toUpperCase()}: ${result.status}`);
    console.log(`   Issue: ${result.issue}`);
    if (result.impact) {
      console.log(`   Impact: ${result.impact}`);
    }
    console.log('');
  });
  
  // Generate recommendations
  console.log('🔧 RECOMMENDATIONS:');
  console.log('-'.repeat(50));
  
  if (results.scenario1.status === 'PARTIAL_FAILURE') {
    console.log('• Add session recovery mechanism for interrupted uploads');
  }
  
  if (results.scenario2.status === 'SECURITY_ISSUE') {
    console.log('• Strengthen API authentication enforcement');
  }
  
  if (results.scenario3.status === 'TIMEOUT_FAILURE') {
    console.log('• Implement better timeout handling and user feedback');
  }
  
  if (results.scenario4.status === 'NETWORK_FAILURE') {
    console.log('• Add network error recovery and offline capability');
  }
  
  if (results.scenario5.orphanedRecords > 0) {
    console.log('• Clean up orphaned database records');
  }
  
  console.log('• Add comprehensive error monitoring and alerting');
  console.log('• Implement session state recovery mechanisms');
  console.log('• Add user notification for background processing failures');
  
  return results;
}

// Run tests
runAllTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
