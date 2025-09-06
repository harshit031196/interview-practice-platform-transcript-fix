// Use built-in fetch (Node.js 18+) or import node-fetch
const fetch = globalThis.fetch || require('node-fetch');
require('dotenv').config({ path: '.env.local' });

// Session details from the video URL
const sessionId = 'cmey5ghed0007lmf599bx19gg';
const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey5ghed0007lmf599bx19gg/1756551611270_interview_cmey5ghed0007lmf599bx19gg_1756551610754.webm';

// API key for authentication
const API_SECRET_KEY = process.env.API_SECRET_KEY;

if (!API_SECRET_KEY) {
  console.error('❌ API_SECRET_KEY environment variable is required');
  console.error('Please add API_SECRET_KEY to your .env.local file');
  process.exit(1);
}

async function triggerVideoAnalysis() {
  console.log('🎥 Triggering video analysis for session:', sessionId);
  console.log('📹 Video URI:', videoUri);
  
  try {
    // First, check if analysis results already exist
    console.log('\n1️⃣ Checking for existing analysis results...');
    const existingResults = await fetch(`http://localhost:3000/api/video-analysis/results/${sessionId}`, {
      headers: {
        'x-api-key': API_SECRET_KEY,
        'Content-Type': 'application/json'
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
        'x-api-key': API_SECRET_KEY
      },
      body: JSON.stringify({
        videoUri: videoUri,
        sessionId: sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    console.log('Response status:', analysisResponse.status);
    console.log('Response headers:', Object.fromEntries(analysisResponse.headers.entries()));
    
    if (analysisResponse.ok) {
      const analysisData = await analysisResponse.json();
      console.log('✅ Video analysis completed successfully!');
      console.log('\n📊 Analysis Results:');
      
      if (analysisData.videoAnalysis) {
        const va = analysisData.videoAnalysis;
        console.log('Face Detection:', va.faceDetection?.detected ? 'Yes' : 'No');
        console.log('Speech Transcription:', va.speechTranscription?.hasAudio ? 'Yes' : 'No');
        console.log('Person Detection:', va.personDetection?.detected ? 'Yes' : 'No');
        console.log('Overall Confidence:', va.confidence || 'N/A');
        
        if (va.speechTranscription?.transcript) {
          console.log('Transcript:', va.speechTranscription.transcript.substring(0, 200) + '...');
        }
      }
      
      // Store results for future retrieval
      console.log('\n3️⃣ Storing analysis results...');
      const storeResponse = await fetch(`http://localhost:3000/api/video-analysis/results/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_SECRET_KEY
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
      
      if (analysisResponse.status === 401) {
        console.log('\n🔍 Authentication Issue:');
        console.log('- Check that API_SECRET_KEY is set in your .env.local file');
        console.log('- Ensure the API key matches the one configured in the server');
        console.log('- API key authentication is required for external scripts');
      }
    }
    
  } catch (error) {
    console.error('💥 Script error:', error);
  }
}

// Run the analysis
triggerVideoAnalysis();
