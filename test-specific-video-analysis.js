// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Import fetch with compatibility for Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Get API key from environment
const API_KEY = process.env.API_SECRET_KEY;

// Video details from the GCS URL
const sessionId = 'cmeykoe1i0001xfcbvg4mu7sk';
const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmeykoe1i0001xfcbvg4mu7sk/1756577163383_interview_cmeykoe1i0001xfcbvg4mu7sk_1756577162610.webm';

async function testVideoAnalysis() {
  console.log('🎥 Testing video analysis for session:', sessionId);
  console.log('📹 Video URI:', videoUri);
  
  try {
    // First, check if analysis results already exist
    console.log('\n1️⃣ Checking for existing analysis results...');
    const existingResults = await fetch(`http://localhost:3000/api/video-analysis?sessionId=${sessionId}`, {
      headers: {
        'x-api-key': API_KEY
      }
    });
    
    if (existingResults.ok) {
      const data = await existingResults.json();
      console.log('✅ Found existing analysis results:');
      console.log(JSON.stringify(data, null, 2));
      return;
    } else if (existingResults.status === 404) {
      console.log('❌ No existing analysis found. Triggering new analysis...');
    } else {
      console.log('⚠️ Error checking existing results:', existingResults.status, await existingResults.text());
    }
    
    // Trigger video analysis
    console.log('\n2️⃣ Triggering video analysis...');
    const analysisResponse = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        videoUri: videoUri,
        sessionId: sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      console.log('✅ Video analysis completed successfully!');
      console.log('\n📊 Analysis Results:');
      console.log(JSON.stringify(analysisData, null, 2));
      
      // Store results for future retrieval
      console.log('\n3️⃣ Storing analysis results...');
      const storeResponse = await fetch(`http://localhost:3000/api/video-analysis/results/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify(analysisData)
      });
      
      if (storeResponse.ok) {
        console.log('✅ Analysis results stored successfully!');
      } else {
        console.log('⚠️ Failed to store results:', await storeResponse.text());
      }
      
    } else {
      const errorText = await analysisResponse.text();
      console.log('❌ Video analysis failed:');
      console.log('Status:', analysisResponse.status);
      console.log('Error:', errorText);
    }
    
  } catch (error) {
    console.error('💥 Script error:', error);
  }
}

// Run the test
testVideoAnalysis();
