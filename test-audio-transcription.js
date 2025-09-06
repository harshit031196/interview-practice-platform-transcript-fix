const { SpeechClient } = require('@google-cloud/speech');
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');

// Initialize Google Cloud clients
const speechClient = new SpeechClient({
  projectId: 'wingman-interview-470419',
});

const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});

// Test video URI
const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey14caz00078t639l6iusgn/1756544322829_interview_cmey14caz00078t639l6iusgn_1756544322303.webm';

// Enhanced audio extraction function for WEBM files
async function extractAndTranscribeAudio(videoUri) {
  try {
    console.log('🎤 Performing dedicated audio transcription for:', videoUri);
    
    // Configure audio recognition for WEBM/OPUS format
    const audioConfig = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 1,
        maxSpeakerCount: 3,
      },
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      model: 'video', // Optimized for video content
      useEnhanced: true,
    };

    // Use Speech-to-Text API directly for better audio handling
    const [operation] = await speechClient.longRunningRecognize({
      config: audioConfig,
      audio: {
        uri: videoUri,
      },
    });

    console.log('⏳ Audio transcription operation started, waiting for completion...');
    const [response] = await operation.promise();
    console.log('✅ Audio transcription completed');

    // Process transcription results
    if (response.results && response.results.length > 0) {
      const transcript = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .filter(Boolean)
        .join(' ');

      const confidence = response.results.reduce((sum, result) => 
        sum + (result.alternatives?.[0]?.confidence || 0), 0) / response.results.length;

      return {
        hasAudio: true,
        transcript,
        confidence,
        speakerCount: response.results.length,
        wordCount: transcript.split(' ').length,
        results: response.results
      };
    }

    return { hasAudio: false, transcript: '', confidence: 0, speakerCount: 0 };
  } catch (error) {
    console.error('❌ Audio transcription error:', error);
    return { 
      hasAudio: false, 
      transcript: '', 
      confidence: 0, 
      speakerCount: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Test Video Intelligence API speech transcription
async function testVideoIntelligenceAudio(videoUri) {
  try {
    console.log('🎬 Testing Video Intelligence API speech transcription...');
    
    const [operation] = await videoClient.annotateVideo({
      inputUri: videoUri,
      features: ['SPEECH_TRANSCRIPTION'],
      videoContext: {
        speechTranscriptionConfig: {
          languageCode: 'en-US',
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: 2,
          enableAutomaticPunctuation: true,
          audioTracks: [0], // Process first audio track
        },
      },
    });

    console.log('⏳ Video Intelligence operation started, waiting for completion...');
    const [result] = await operation.promise();
    console.log('✅ Video Intelligence operation completed');

    const speechTranscriptions = result.annotationResults?.[0]?.speechTranscriptions || [];
    
    if (speechTranscriptions.length > 0) {
      const transcripts = speechTranscriptions.map(annotation => 
        annotation.alternatives?.[0]?.transcript || ''
      ).filter(Boolean);

      return {
        hasAudio: true,
        transcript: transcripts.join(' '),
        confidence: speechTranscriptions[0]?.alternatives?.[0]?.confidence || 0,
        speakerCount: speechTranscriptions.length,
        method: 'video-intelligence-api'
      };
    }

    return { hasAudio: false, transcript: '', confidence: 0, speakerCount: 0 };
  } catch (error) {
    console.error('❌ Video Intelligence audio error:', error);
    return { 
      hasAudio: false, 
      transcript: '', 
      confidence: 0, 
      speakerCount: 0, 
      error: error instanceof Error ? error.message : 'Unknown error',
      method: 'video-intelligence-api'
    };
  }
}

async function runAudioTests() {
  console.log('🚀 Starting comprehensive audio transcription tests...\n');
  
  try {
    // Test both methods in parallel
    console.log('📊 Running both Speech-to-Text API and Video Intelligence API tests in parallel...\n');
    
    const [speechResult, videoResult] = await Promise.allSettled([
      extractAndTranscribeAudio(videoUri),
      testVideoIntelligenceAudio(videoUri)
    ]);

    console.log('\n📋 RESULTS SUMMARY:');
    console.log('==================');

    // Speech-to-Text API Results
    console.log('\n🎤 Speech-to-Text API Results:');
    if (speechResult.status === 'fulfilled') {
      const result = speechResult.value;
      console.log(`   Audio Detected: ${result.hasAudio ? '✅ YES' : '❌ NO'}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Word Count: ${result.wordCount || 0}`);
      console.log(`   Speaker Count: ${result.speakerCount || 0}`);
      if (result.transcript) {
        console.log(`   Transcript Preview: "${result.transcript.substring(0, 100)}${result.transcript.length > 100 ? '...' : ''}"`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    } else {
      console.log(`   ❌ Failed: ${speechResult.reason}`);
    }

    // Video Intelligence API Results
    console.log('\n🎬 Video Intelligence API Results:');
    if (videoResult.status === 'fulfilled') {
      const result = videoResult.value;
      console.log(`   Audio Detected: ${result.hasAudio ? '✅ YES' : '❌ NO'}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Speaker Count: ${result.speakerCount || 0}`);
      if (result.transcript) {
        console.log(`   Transcript Preview: "${result.transcript.substring(0, 100)}${result.transcript.length > 100 ? '...' : ''}"`);
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    } else {
      console.log(`   ❌ Failed: ${videoResult.reason}`);
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('===================');
    
    const speechSuccess = speechResult.status === 'fulfilled' && speechResult.value.hasAudio;
    const videoSuccess = videoResult.status === 'fulfilled' && videoResult.value.hasAudio;
    
    if (speechSuccess || videoSuccess) {
      console.log('✅ Audio transcription is now working!');
      if (speechSuccess && videoSuccess) {
        console.log('   Both methods detected audio. Using Speech-to-Text API for better accuracy.');
      } else if (speechSuccess) {
        console.log('   Speech-to-Text API successfully detected audio.');
      } else {
        console.log('   Video Intelligence API successfully detected audio.');
      }
    } else {
      console.log('❌ Audio transcription still not working. Possible issues:');
      console.log('   - Video file may not contain audio');
      console.log('   - Audio format may not be supported');
      console.log('   - Google Cloud permissions may be insufficient');
      console.log('   - Audio quality may be too poor for transcription');
    }

  } catch (error) {
    console.error('💥 Test script error:', error);
  }
}

// Run the tests
runAudioTests();
