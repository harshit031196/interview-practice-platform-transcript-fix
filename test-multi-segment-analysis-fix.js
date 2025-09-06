/**
 * Test script to verify the fixed multi-segment video analysis
 * This script tests the robustness of the video analysis API and aggregation logic
 * with various edge cases including null/undefined values and malformed responses
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_KEY = process.env.API_KEY || 'test-api-key';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SESSION_ID = process.env.SESSION_ID || uuidv4();
const TEST_VIDEO_PATH = process.env.TEST_VIDEO_PATH || './public/videos/test-video.mp4';

// Test cases for multi-segment analysis
const testCases = [
  {
    name: 'Normal multi-segment analysis',
    segments: [
      { index: 0, hasResults: true, malformed: false },
      { index: 1, hasResults: true, malformed: false },
      { index: 2, hasResults: true, malformed: false }
    ]
  },
  {
    name: 'Missing segment results',
    segments: [
      { index: 0, hasResults: true, malformed: false },
      { index: 1, hasResults: false, malformed: false },
      { index: 2, hasResults: true, malformed: false }
    ]
  },
  {
    name: 'Malformed segment data',
    segments: [
      { index: 0, hasResults: true, malformed: false },
      { index: 1, hasResults: true, malformed: true },
      { index: 2, hasResults: true, malformed: false }
    ]
  },
  {
    name: 'Out of order segments',
    segments: [
      { index: 2, hasResults: true, malformed: false },
      { index: 0, hasResults: true, malformed: false },
      { index: 1, hasResults: true, malformed: false }
    ]
  },
  {
    name: 'Missing segment index',
    segments: [
      { index: undefined, hasResults: true, malformed: false },
      { index: 1, hasResults: true, malformed: false },
      { index: 2, hasResults: true, malformed: false }
    ]
  }
];

// Mock analysis results
const createMockAnalysisResult = (segmentIndex, hasResults, malformed) => {
  if (!hasResults) {
    return { segmentIndex, results: {} };
  }

  if (malformed) {
    return { 
      segmentIndex, 
      results: null,
      analysisData: undefined
    };
  }

  return {
    segmentIndex,
    results: {
      speech_analysis: {
        transcript: `This is transcript for segment ${segmentIndex}`,
        total_words: 50 + segmentIndex * 10,
        words_per_minute: 120 + segmentIndex * 5,
        clarity_score: 0.8 + segmentIndex * 0.05,
        filler_words: {
          count: 5 + segmentIndex,
          percentage: 10 + segmentIndex,
          details: [{ word: 'um', count: 3 }, { word: 'like', count: 2 }]
        },
        pacing_analysis: {
          wpm_timeline: [
            { time: 0, wpm: 100 },
            { time: 10, wpm: 120 },
            { time: 20, wpm: 130 }
          ]
        },
        utterances: [
          { text: 'First utterance', start_time: 0, end_time: 5 },
          { text: 'Second utterance', start_time: 6, end_time: 10 }
        ]
      },
      facial_analysis: {
        total_frames_analyzed: 300 + segmentIndex * 50,
        average_detection_confidence: 0.9 + segmentIndex * 0.02,
        emotion_statistics: {
          joy: { average: 0.6 + segmentIndex * 0.1, max: 0.9, min: 0.3 },
          sorrow: { average: 0.1, max: 0.3, min: 0 },
          anger: { average: 0.05, max: 0.2, min: 0 },
          surprise: { average: 0.25, max: 0.7, min: 0.1 }
        }
      },
      confidence_analysis: {
        average_eye_contact_score: 0.75 + segmentIndex * 0.05,
        eye_contact_consistency: 0.8 + segmentIndex * 0.03,
        head_stability_score: 0.85 + segmentIndex * 0.02,
        confidence_score: 0.8 + segmentIndex * 0.04
      },
      durationSec: 30 + segmentIndex * 10
    }
  };
};

// Mock API for testing
const mockVideoAnalysisAPI = async (testCase) => {
  console.log(`\n🧪 Running test case: ${testCase.name}`);
  
  // Create mock analysis results for each segment
  const mockResults = testCase.segments.map(segment => 
    createMockAnalysisResult(segment.index, segment.hasResults, segment.malformed)
  );
  
  console.log(`📊 Created ${mockResults.length} mock segment results`);
  
  try {
    // Test the aggregation function directly
    console.log('🔄 Testing aggregation with mock data...');
    
    // Log the mock results for debugging
    console.log('Mock results:');
    mockResults.forEach((result, i) => {
      console.log(`Segment ${i}: index=${result.segmentIndex}, hasResults=${!!result.results && Object.keys(result.results).length > 0}`);
    });
    
    // Call the API endpoint to test the aggregation
    const response = await fetch(`${BASE_URL}/api/test/aggregate-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({ analyses: mockResults })
    });
    
    if (response.ok) {
      const aggregatedResults = await response.json();
      console.log('✅ Aggregation successful');
      console.log('Aggregated results summary:');
      console.log(`- Total words: ${aggregatedResults.videoAnalysis?.speech_analysis?.total_words || 'N/A'}`);
      console.log(`- Duration: ${aggregatedResults.videoAnalysis?.durationSec || 'N/A'} seconds`);
      console.log(`- Confidence score: ${aggregatedResults.videoAnalysis?.confidence_analysis?.confidence_score || 'N/A'}`);
      return { success: true, results: aggregatedResults };
    } else {
      console.error(`❌ API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error(errorText);
      return { success: false, error: errorText };
    }
  } catch (error) {
    console.error('❌ Test error:', error);
    return { success: false, error: error.message };
  }
};

// Test the actual API with real video segments
const testRealVideoUpload = async () => {
  console.log('\n🧪 Testing real video upload and analysis with multiple segments');
  
  try {
    // Create a unique session ID for this test
    const testSessionId = `test-${uuidv4()}`;
    console.log(`📝 Test session ID: ${testSessionId}`);
    
    // Check if test video exists
    if (!fs.existsSync(TEST_VIDEO_PATH)) {
      console.error(`❌ Test video not found at ${TEST_VIDEO_PATH}`);
      return { success: false, error: 'Test video not found' };
    }
    
    // Upload 3 segments of the same test video
    const segmentCount = 3;
    const uploadResults = [];
    
    for (let i = 0; i < segmentCount; i++) {
      console.log(`📤 Uploading segment ${i}...`);
      
      // Create form data with the video file
      const formData = new FormData();
      const videoBlob = new Blob([fs.readFileSync(TEST_VIDEO_PATH)]);
      formData.append('video', videoBlob, `segment-${i}.mp4`);
      formData.append('sessionId', testSessionId);
      formData.append('segmentIndex', i.toString());
      
      // Upload the video
      const uploadResponse = await fetch(`${BASE_URL}/api/video-upload`, {
        method: 'POST',
        headers: {
          'x-api-key': API_KEY
        },
        body: formData
      });
      
      if (uploadResponse.ok) {
        const result = await uploadResponse.json();
        console.log(`✅ Segment ${i} uploaded successfully: ${result.videoUri}`);
        uploadResults.push({ segmentIndex: i, videoUri: result.videoUri });
      } else {
        console.error(`❌ Failed to upload segment ${i}: ${uploadResponse.status} ${uploadResponse.statusText}`);
        const errorText = await uploadResponse.text();
        console.error(errorText);
        return { success: false, error: errorText };
      }
    }
    
    // Trigger analysis for each segment
    console.log('\n🔍 Triggering analysis for all segments...');
    
    for (const segment of uploadResults) {
      console.log(`🔄 Triggering analysis for segment ${segment.segmentIndex}...`);
      
      const analysisResponse = await fetch(`${BASE_URL}/api/video-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          videoUri: segment.videoUri,
          sessionId: testSessionId,
          segmentIndex: segment.segmentIndex
        })
      });
      
      if (analysisResponse.ok) {
        console.log(`✅ Analysis triggered for segment ${segment.segmentIndex}`);
      } else {
        console.error(`❌ Failed to trigger analysis for segment ${segment.segmentIndex}: ${analysisResponse.status} ${analysisResponse.statusText}`);
        const errorText = await analysisResponse.text();
        console.error(errorText);
      }
    }
    
    // Poll for results
    console.log('\n⏱️ Polling for analysis results...');
    let allSegmentsAnalyzed = false;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes (10 second intervals)
    
    while (!allSegmentsAnalyzed && attempts < maxAttempts) {
      attempts++;
      console.log(`🔄 Polling attempt ${attempts}/${maxAttempts}...`);
      
      // Wait 10 seconds between polling attempts
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Check for results
      const resultsResponse = await fetch(`${BASE_URL}/api/video-analysis?sessionId=${testSessionId}`, {
        headers: {
          'x-api-key': API_KEY
        }
      });
      
      if (resultsResponse.ok) {
        const analyses = await resultsResponse.json();
        console.log(`📊 Received ${analyses.length} of ${segmentCount} segment results`);
        
        // Check if all segments have been analyzed
        if (analyses.length >= segmentCount) {
          const validResults = analyses.every(analysis => {
            const resultsData = analysis.results || (analysis.analysisData ? analysis.analysisData : null);
            const hasResults = resultsData && Object.keys(resultsData).length > 0;
            if (!hasResults) {
              console.log(`⚠️ Segment ${analysis.segmentIndex} has empty results`);
            }
            return hasResults;
          });
          
          if (validResults) {
            allSegmentsAnalyzed = true;
            console.log('✅ All segments analyzed successfully!');
            
            // Test the aggregation
            console.log('\n🔄 Testing aggregation with real results...');
            
            // Log the results for debugging
            analyses.forEach((result, i) => {
              console.log(`Segment ${i}: index=${result.segmentIndex}, id=${result.id?.substring(0, 8) || 'unknown'}`);
            });
            
            // Call the API endpoint to test the aggregation
            const aggResponse = await fetch(`${BASE_URL}/api/test/aggregate-analysis`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
              },
              body: JSON.stringify({ analyses })
            });
            
            if (aggResponse.ok) {
              const aggregatedResults = await aggResponse.json();
              console.log('✅ Aggregation successful');
              console.log('Aggregated results summary:');
              console.log(`- Total words: ${aggregatedResults.videoAnalysis?.speech_analysis?.total_words || 'N/A'}`);
              console.log(`- Duration: ${aggregatedResults.videoAnalysis?.durationSec || 'N/A'} seconds`);
              console.log(`- Confidence score: ${aggregatedResults.videoAnalysis?.confidence_analysis?.confidence_score || 'N/A'}`);
              return { success: true, results: aggregatedResults };
            } else {
              console.error(`❌ Aggregation API error: ${aggResponse.status} ${aggResponse.statusText}`);
              const errorText = await aggResponse.text();
              console.error(errorText);
            }
          }
        }
      } else {
        console.error(`❌ Failed to get results: ${resultsResponse.status} ${resultsResponse.statusText}`);
        const errorText = await resultsResponse.text();
        console.error(errorText);
      }
    }
    
    if (!allSegmentsAnalyzed) {
      console.error('❌ Timed out waiting for all segments to be analyzed');
      return { success: false, error: 'Timeout waiting for analysis' };
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    return { success: false, error: error.message };
  }
};

// Run all the tests
const runAllTests = async () => {
  console.log('🧪 Starting multi-segment video analysis tests');
  
  // Run mock tests
  for (const testCase of testCases) {
    await mockVideoAnalysisAPI(testCase);
  }
  
  // Run real video upload test if environment allows
  if (process.env.RUN_REAL_TEST === 'true') {
    await testRealVideoUpload();
  } else {
    console.log('\n⏭️ Skipping real video upload test (set RUN_REAL_TEST=true to enable)');
  }
  
  console.log('\n✅ All tests completed');
};

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
