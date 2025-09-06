/**
 * Test script to verify the stability of the speech-to-text streaming API
 * This script simulates a long-running streaming session to test 
 * for DEADLINE_EXCEEDED errors and reconnection logic
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_URL = 'http://localhost:3000/api/ai/speech-stream-v2';
const TEST_DURATION_MINS = 10; // Run test for this many minutes
const CHUNK_INTERVAL_MS = 500; // Send a chunk every 500ms
const SESSION_ID = `test-session-${Date.now()}`;
const API_KEY = process.env.API_KEY || ''; // Set your API key in env or here

// Test audio file (WEBM format recommended)
const TEST_AUDIO_PATH = process.argv[2] || './test-audio.webm';

if (!fs.existsSync(TEST_AUDIO_PATH)) {
  console.error(`Error: Test audio file not found: ${TEST_AUDIO_PATH}`);
  console.log('Usage: node test-speech-stream-stability.js [path-to-audio.webm]');
  process.exit(1);
}

console.log(`Reading test audio file: ${TEST_AUDIO_PATH}`);
const audioBuffer = fs.readFileSync(TEST_AUDIO_PATH);
console.log(`Loaded ${audioBuffer.length} bytes of audio data`);

// Split into chunks to simulate streaming
const CHUNK_SIZE = 25 * 1024; // 25KB chunks
const audioChunks = [];
for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
  const chunk = audioBuffer.slice(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
  audioChunks.push(chunk);
}
console.log(`Split audio into ${audioChunks.length} chunks`);

// Test metrics
const metrics = {
  requestsSent: 0,
  requestsFailed: 0,
  reconnections: 0,
  timeoutErrors: 0,
  successfulResponses: 0,
  transcriptUpdates: 0,
  currentTranscript: '',
};

// Start a new streaming session
async function startStreamingSession() {
  try {
    console.log(`Starting streaming session with ID: ${SESSION_ID}`);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Method': 'hybrid-session',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        startStream: true,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to start streaming session: ${error}`);
    }
    
    const result = await response.json();
    console.log('Streaming session started:', result);
    return true;
  } catch (error) {
    console.error('Error starting streaming session:', error);
    return false;
  }
}

// Send a single audio chunk
async function sendAudioChunk(chunk, index) {
  try {
    metrics.requestsSent++;
    
    const formData = new FormData();
    formData.append('audio', new Blob([chunk], { type: 'audio/webm' }), `chunk_${index}.webm`);
    formData.append('sessionId', SESSION_ID);
    
    const response = await fetch(API_URL, {
      method: 'PUT',
      headers: {
        'X-Auth-Method': 'hybrid-session',
        'X-API-Key': API_KEY,
      },
      body: formData,
    });
    
    if (!response.ok) {
      metrics.requestsFailed++;
      const error = await response.text();
      
      // Check for timeout errors
      if (error.includes('DEADLINE_EXCEEDED')) {
        metrics.timeoutErrors++;
        console.error(`[${new Date().toISOString()}] DEADLINE_EXCEEDED error detected`);
      }
      
      // Check for reconnection
      if (error.includes('reconnect') || error.includes('recovered')) {
        metrics.reconnections++;
        console.log(`[${new Date().toISOString()}] Stream reconnection detected`);
      }
      
      throw new Error(`Failed to process chunk #${index}: ${error}`);
    }
    
    metrics.successfulResponses++;
    const result = await response.json();
    
    // If we have a transcript, update metrics
    if (result.transcript) {
      metrics.transcriptUpdates++;
      metrics.currentTranscript = result.transcript;
      console.log(`[${new Date().toISOString()}] Received transcript update (${result.transcript.length} chars)`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error sending chunk #${index}:`, error.message);
    return false;
  }
}

// End streaming session and get final results
async function endStreamingSession() {
  try {
    console.log('Ending streaming session...');
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Method': 'hybrid-session',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        finalizeStream: true,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to end streaming session: ${error}`);
    }
    
    const result = await response.json();
    console.log('Final transcription result:', result);
    
    if (result.transcript) {
      console.log('Final transcript:', result.transcript);
      console.log('Confidence:', result.confidence);
      metrics.currentTranscript = result.transcript;
    }
    
    return result;
  } catch (error) {
    console.error('Error ending streaming session:', error);
    return null;
  }
}

// Print test progress
function printProgress() {
  console.log('\n========== TEST PROGRESS ==========');
  console.log(`Time elapsed: ${Math.floor((Date.now() - testStartTime) / 1000)} seconds`);
  console.log(`Requests sent: ${metrics.requestsSent}`);
  console.log(`Successful responses: ${metrics.successfulResponses}`);
  console.log(`Failed requests: ${metrics.requestsFailed}`);
  console.log(`Timeout errors: ${metrics.timeoutErrors}`);
  console.log(`Reconnections: ${metrics.reconnections}`);
  console.log(`Transcript updates: ${metrics.transcriptUpdates}`);
  console.log(`Current transcript length: ${metrics.currentTranscript.length} chars`);
  console.log('=====================================\n');
}

// Main test function
async function runTest() {
  // Start session
  const sessionStarted = await startStreamingSession();
  if (!sessionStarted) {
    console.error('Failed to start session, aborting test.');
    return;
  }
  
  const testStartTime = Date.now();
  const testEndTime = testStartTime + (TEST_DURATION_MINS * 60 * 1000);
  let chunkIndex = 0;
  let audioChunkIndex = 0;
  
  console.log(`Starting test, will run for ${TEST_DURATION_MINS} minutes...`);
  
  // Progress reporting interval
  const progressInterval = setInterval(() => {
    printProgress();
  }, 60000); // Print progress every minute
  
  // Send chunks in a loop
  while (Date.now() < testEndTime) {
    // Get next audio chunk (looping through the available chunks)
    const chunk = audioChunks[audioChunkIndex % audioChunks.length];
    audioChunkIndex++;
    
    // Send the chunk
    await sendAudioChunk(chunk, chunkIndex);
    chunkIndex++;
    
    // Wait for the chunk interval
    await new Promise(resolve => setTimeout(resolve, CHUNK_INTERVAL_MS));
  }
  
  clearInterval(progressInterval);
  
  // End the session
  const finalResult = await endStreamingSession();
  
  // Print final results
  console.log('\n========== FINAL TEST RESULTS ==========');
  printProgress();
  
  // Calculate success rate
  const successRate = (metrics.successfulResponses / metrics.requestsSent) * 100;
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
  
  // Test evaluation
  if (metrics.timeoutErrors === 0) {
    console.log('✅ TEST PASSED: No DEADLINE_EXCEEDED errors detected!');
  } else {
    console.log(`❌ TEST FAILED: Detected ${metrics.timeoutErrors} timeout errors`);
    console.log(`   But system recovered with ${metrics.reconnections} reconnections`);
  }
  
  if (successRate > 95) {
    console.log('✅ HIGH RELIABILITY: Success rate above 95%');
  } else if (successRate > 80) {
    console.log('⚠️ MODERATE RELIABILITY: Success rate between 80-95%');
  } else {
    console.log('❌ LOW RELIABILITY: Success rate below 80%');
  }
  
  console.log('=======================================');
}

// Run the test
console.log('Speech-to-Text Streaming Stability Test');
console.log('---------------------------------------');
runTest().catch(error => {
  console.error('Test failed with error:', error);
});
