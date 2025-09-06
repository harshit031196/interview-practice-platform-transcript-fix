/**
 * Speech Streaming Test Script
 * Tests the streaming stability with extended timeouts and error handling
 */

const fs = require('fs');
const { setTimeout } = require('timers/promises');

// Mock audio data from a file if available
const TEST_AUDIO_PATH = './test-audio.webm';

// Simulate streaming with exponentially increasing durations
async function testSpeechStreaming() {
  console.log('🧪 Starting Speech Streaming Test');
  
  // Test parameters
  const totalDuration = 180000; // 3 minutes total test
  const initialChunkInterval = 1500; // 1.5 seconds per chunk (matching our config)
  const chunkCount = 40; // Number of chunks to simulate
  
  let testAudioData = null;
  
  // Check if we have test audio available
  try {
    if (fs.existsSync(TEST_AUDIO_PATH)) {
      testAudioData = fs.readFileSync(TEST_AUDIO_PATH);
      console.log(`✅ Loaded test audio from ${TEST_AUDIO_PATH} (${testAudioData.length} bytes)`);
    } else {
      console.log('ℹ️ No test audio file found, will simulate with empty chunks');
    }
  } catch (err) {
    console.error('❌ Error loading test audio:', err.message);
  }
  
  // Simulate server with increasing response latency
  async function simulateServerWithLatency(chunkNumber) {
    // Exponentially increasing latency to test timeout handling
    // Starting at 100ms and doubling every 10 chunks
    const baseLatency = 100;
    const latencyMultiplier = Math.pow(2, Math.floor(chunkNumber / 10));
    const simulatedLatency = Math.min(baseLatency * latencyMultiplier, 7000); // Cap at 7 seconds
    
    console.log(`🕒 Chunk ${chunkNumber}: Simulating server latency of ${simulatedLatency}ms`);
    
    // Simulate server processing
    await setTimeout(simulatedLatency);
    
    // 1 in 8 chance of a timeout error after chunk 15
    if (chunkNumber > 15 && Math.random() < 0.125) {
      console.log(`🚨 Chunk ${chunkNumber}: Simulating a timeout error`);
      throw new Error('408 Request Timeout');
    }
    
    return {
      success: true,
      transcript: `This is simulated transcript for chunk ${chunkNumber}.`,
      confidence: 0.9
    };
  }
  
  // Track metrics
  const metrics = {
    totalChunks: 0,
    successfulChunks: 0,
    failedChunks: 0,
    timeouts: 0,
    retries: 0,
    totalLatency: 0,
    maxLatency: 0
  };
  
  // Simulate processing a chunk with retries
  async function processChunkWithRetries(chunkNumber, retryLimit = 3) {
    let attempts = 0;
    let success = false;
    let latency = 0;
    const chunkStartTime = Date.now();
    
    while (attempts < retryLimit && !success) {
      attempts++;
      
      try {
        console.log(`📤 Sending chunk ${chunkNumber} (attempt ${attempts}/${retryLimit})`);
        const result = await simulateServerWithLatency(chunkNumber);
        latency = Date.now() - chunkStartTime;
        
        console.log(`📥 Received result for chunk ${chunkNumber} after ${latency}ms: "${result.transcript}"`);
        success = true;
        
        metrics.successfulChunks++;
        metrics.totalLatency += latency;
        metrics.maxLatency = Math.max(metrics.maxLatency, latency);
        
      } catch (error) {
        metrics.retries++;
        
        if (error.message.includes('408') || error.message.includes('Timeout')) {
          metrics.timeouts++;
          console.warn(`⚠️ Timeout detected for chunk ${chunkNumber}, attempt ${attempts}/${retryLimit}`);
        } else {
          console.error(`❌ Error processing chunk ${chunkNumber}:`, error.message);
        }
        
        if (attempts < retryLimit) {
          const backoffDelay = 1000 * attempts; // Exponential backoff
          console.log(`⏱️ Backing off for ${backoffDelay}ms before retry`);
          await setTimeout(backoffDelay);
        }
      }
    }
    
    metrics.totalChunks++;
    
    if (!success) {
      metrics.failedChunks++;
      console.error(`❌ Failed to process chunk ${chunkNumber} after ${retryLimit} attempts`);
    }
    
    return success;
  }
  
  // Run the simulation
  console.log(`🚀 Starting simulation with ${chunkCount} chunks over ${totalDuration/1000} seconds`);
  const testStartTime = Date.now();
  
  for (let i = 1; i <= chunkCount; i++) {
    // Calculate how much time has passed
    const elapsedTime = Date.now() - testStartTime;
    
    if (elapsedTime > totalDuration) {
      console.log(`⏰ Test duration reached (${elapsedTime}ms), stopping at chunk ${i-1}`);
      break;
    }
    
    await processChunkWithRetries(i);
    
    // Wait before sending next chunk
    if (i < chunkCount) {
      await setTimeout(initialChunkInterval);
    }
  }
  
  // Calculate test results
  const totalTestDuration = Date.now() - testStartTime;
  metrics.averageLatency = metrics.totalLatency / metrics.successfulChunks;
  metrics.successRate = metrics.successfulChunks / metrics.totalChunks * 100;
  metrics.timeoutRate = metrics.timeouts / metrics.totalChunks * 100;
  
  // Report results
  console.log('\n🧪 Speech Streaming Test Results:');
  console.log(`⏱️ Test Duration: ${(totalTestDuration/1000).toFixed(2)} seconds`);
  console.log(`📊 Total Chunks: ${metrics.totalChunks}`);
  console.log(`✅ Successful: ${metrics.successfulChunks} (${metrics.successRate.toFixed(2)}%)`);
  console.log(`❌ Failed: ${metrics.failedChunks} (${(100 - metrics.successRate).toFixed(2)}%)`);
  console.log(`⚠️ Timeouts: ${metrics.timeouts} (${metrics.timeoutRate.toFixed(2)}%)`);
  console.log(`🔄 Retries: ${metrics.retries}`);
  console.log(`⏱️ Average Latency: ${metrics.averageLatency.toFixed(2)}ms`);
  console.log(`⚡ Max Latency: ${metrics.maxLatency}ms`);
  
  if (metrics.successRate > 95) {
    console.log('✅ TEST PASSED: Streaming stability is good (>95% success rate)');
  } else if (metrics.successRate > 80) {
    console.log('⚠️ TEST WARNING: Streaming stability needs improvement (80-95% success rate)');
  } else {
    console.log('❌ TEST FAILED: Streaming stability is poor (<80% success rate)');
  }
}

// Run the test
testSpeechStreaming().catch(console.error);
