const { SpeechClient } = require('@google-cloud/speech');
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');

// Test the specific video directly
const sessionId = 'cmey3xh6j0007z9vs44s7psf1';
const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey3xh6j0007z9vs44s7psf1/1756549049132_interview_cmey3xh6j0007z9vs44s7psf1_1756549048665.webm';

// Initialize Google Cloud clients
const speechClient = new SpeechClient({
  projectId: 'wingman-interview-470419',
});

const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});

async function testVideoDirectly() {
  console.log('🎯 Testing video analysis directly for session:', sessionId);
  console.log('📹 Video URI:', videoUri);
  console.log('');
  
  try {
    // Test if video exists and is accessible
    console.log('1️⃣ Testing video accessibility...');
    
    // Try a simple video intelligence operation first
    const [operation] = await videoClient.annotateVideo({
      inputUri: videoUri,
      features: ['SPEECH_TRANSCRIPTION'],
      videoContext: {
        speechTranscriptionConfig: {
          languageCode: 'en-US',
          enableSpeakerDiarization: true,
          diarizationSpeakerCount: 2,
          enableAutomaticPunctuation: true,
        },
      },
    });

    console.log('⏳ Video analysis operation started...');
    const [result] = await operation.promise();
    console.log('✅ Video analysis completed successfully!');

    // Check results
    const speechTranscriptions = result.annotationResults?.[0]?.speechTranscriptions || [];
    
    if (speechTranscriptions.length > 0) {
      const transcripts = speechTranscriptions.map(annotation => 
        annotation.alternatives?.[0]?.transcript || ''
      ).filter(Boolean);

      console.log('\n📊 ANALYSIS RESULTS:');
      console.log('==================');
      console.log('✅ Audio detected and transcribed');
      console.log('📝 Transcript:', transcripts.join(' '));
      console.log('🎯 Confidence:', (speechTranscriptions[0]?.alternatives?.[0]?.confidence * 100).toFixed(1) + '%');
      console.log('👥 Speaker segments:', speechTranscriptions.length);
      
      console.log('\n💡 CONCLUSION:');
      console.log('==============');
      console.log('✅ The video is accessible and contains analyzable audio');
      console.log('✅ Video analysis should work for this file');
      console.log('❓ The issue is likely in the automatic trigger mechanism');
      
      console.log('\n🔧 POSSIBLE REASONS FOR MISSING ANALYSIS:');
      console.log('=========================================');
      console.log('1. Authentication failure during automatic trigger');
      console.log('2. Network timeout during the interview session');
      console.log('3. Session completion process was interrupted');
      console.log('4. The triggerVideoAnalysisWithRetry function failed silently');
      console.log('5. Database write failure after successful analysis');
      
    } else {
      console.log('\n❌ No audio transcription found');
      console.log('   This could indicate:');
      console.log('   - Video has no audio track');
      console.log('   - Audio quality is too poor');
      console.log('   - Audio format is not supported');
    }
    
  } catch (error) {
    console.error('\n💥 Video analysis failed:', error.message);
    
    if (error.message.includes('not found') || error.message.includes('404')) {
      console.log('\n❌ VIDEO ACCESS ISSUE:');
      console.log('======================');
      console.log('The video file may not exist or is not accessible');
      console.log('This could be why the automatic analysis failed');
    } else if (error.message.includes('permission') || error.message.includes('403')) {
      console.log('\n❌ PERMISSION ISSUE:');
      console.log('====================');
      console.log('Insufficient permissions to access the video');
      console.log('Check Google Cloud Storage permissions');
    } else {
      console.log('\n❌ OTHER ERROR:');
      console.log('===============');
      console.log('Unexpected error during analysis');
    }
  }
}

testVideoDirectly();
