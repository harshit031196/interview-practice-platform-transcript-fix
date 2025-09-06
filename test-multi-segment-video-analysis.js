/**
 * Test script for multi-segment video analysis
 * 
 * This script tests the video analysis API with multiple segments for the same session
 * to verify that the segmentIndex parameter works correctly and avoids unique constraint violations.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Configuration
const API_KEY = process.env.API_KEY || process.env.NEXT_PUBLIC_API_SECRET_KEY;
const BASE_URL = process.env.NEXT_BASE_URL || 'http://localhost:3000';
const TEST_VIDEO_PATH = process.env.TEST_VIDEO_PATH || './public/videos/test-video.webm';
const SESSION_ID = `test-multi-segment-${Date.now()}`;
const NUM_SEGMENTS = 3;

// Validate configuration
if (!API_KEY) {
  console.error('❌ API_KEY or NEXT_PUBLIC_API_SECRET_KEY environment variable is required');
  process.exit(1);
}

if (!fs.existsSync(TEST_VIDEO_PATH)) {
  console.error(`❌ Test video not found at ${TEST_VIDEO_PATH}`);
  process.exit(1);
}

// Helper function to upload a video segment
async function uploadVideoSegment(segmentIndex) {
  console.log(`\n📤 [Segment ${segmentIndex}] Uploading video segment...`);
  
  const formData = new FormData();
  formData.append('file', fs.createReadStream(TEST_VIDEO_PATH), `test-segment-${segmentIndex}.webm`);
  formData.append('sessionId', SESSION_ID);
  
  try {
    const uploadResponse = await fetch(`${BASE_URL}/api/upload/direct`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Auth-Method': 'api_key'
      }
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}: ${await uploadResponse.text()}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`✅ [Segment ${segmentIndex}] Upload successful: ${uploadResult.videoUri}`);
    return uploadResult.videoUri;
  } catch (error) {
    console.error(`❌ [Segment ${segmentIndex}] Upload error:`, error);
    throw error;
  }
}

// Helper function to trigger video analysis
async function triggerVideoAnalysis(videoUri, segmentIndex) {
  console.log(`\n🔍 [Segment ${segmentIndex}] Triggering video analysis...`);
  
  try {
    const analysisResponse = await fetch(`${BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'X-Auth-Method': 'api_key'
      },
      body: JSON.stringify({
        videoUri,
        sessionId: SESSION_ID,
        segmentIndex,
        analysisType: 'comprehensive'
      })
    });
    
    if (!analysisResponse.ok) {
      throw new Error(`Analysis failed with status ${analysisResponse.status}: ${await analysisResponse.text()}`);
    }
    
    const analysisResult = await analysisResponse.json();
    console.log(`✅ [Segment ${segmentIndex}] Analysis triggered successfully. Request ID: ${analysisResult.requestId}`);
    return analysisResult;
  } catch (error) {
    console.error(`❌ [Segment ${segmentIndex}] Analysis error:`, error);
    throw error;
  }
}

// Helper function to check analysis results
async function checkAnalysisResults() {
  console.log(`\n📊 Checking analysis results for session ${SESSION_ID}...`);
  
  try {
    const resultsResponse = await fetch(`${BASE_URL}/api/video-analysis?sessionId=${SESSION_ID}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'X-Auth-Method': 'api_key'
      }
    });
    
    if (!resultsResponse.ok) {
      throw new Error(`Failed to get results with status ${resultsResponse.status}: ${await resultsResponse.text()}`);
    }
    
    const results = await resultsResponse.json();
    console.log(`✅ Found ${results.length} analysis results for session ${SESSION_ID}`);
    
    // Verify segment indexes
    const segmentIndexes = results.map(r => r.segmentIndex).sort((a, b) => a - b);
    console.log(`📋 Segment indexes found: ${segmentIndexes.join(', ')}`);
    
    // Check for expected number of segments
    if (segmentIndexes.length === NUM_SEGMENTS) {
      console.log(`✅ All ${NUM_SEGMENTS} segments were analyzed successfully!`);
    } else {
      console.warn(`⚠️ Expected ${NUM_SEGMENTS} segments but found ${segmentIndexes.length}`);
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error checking analysis results:', error);
    throw error;
  }
}

// Main test function
async function runTest() {
  console.log(`\n🚀 Starting multi-segment video analysis test with ${NUM_SEGMENTS} segments`);
  console.log(`📝 Session ID: ${SESSION_ID}`);
  
  try {
    // Upload and analyze each segment sequentially
    for (let i = 0; i < NUM_SEGMENTS; i++) {
      const videoUri = await uploadVideoSegment(i);
      await triggerVideoAnalysis(videoUri, i);
      
      // Small delay between segments to avoid race conditions
      if (i < NUM_SEGMENTS - 1) {
        console.log(`⏱️ Waiting 2 seconds before next segment...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Wait for analysis to complete (adjust time as needed)
    console.log(`\n⏳ Waiting 10 seconds for analysis to complete...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check results
    const results = await checkAnalysisResults();
    
    console.log(`\n✅ Multi-segment test completed successfully!`);
    return results;
  } catch (error) {
    console.error(`\n❌ Test failed:`, error);
    process.exit(1);
  }
}

// Run the test
runTest().then(results => {
  console.log(`\n📊 Test Summary:`);
  console.log(`- Session ID: ${SESSION_ID}`);
  console.log(`- Segments tested: ${NUM_SEGMENTS}`);
  console.log(`- Segments analyzed: ${results.length}`);
  console.log(`- Analysis successful: ${results.length === NUM_SEGMENTS ? 'Yes ✅' : 'No ❌'}`);
}).catch(error => {
  console.error('Fatal error:', error);
});
