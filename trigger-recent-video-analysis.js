const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

async function triggerRecentVideoAnalysis() {
  try {
    const sessionId = 'cmey7ql0v000911zba3x6s4ec';
    const userId = 'cmexwu4d50000atgub3z63fdc';
    const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey7ql0v000911zba3x6s4ec/1756555450302_interview_cmey7ql0v000911zba3x6s4ec_1756555449782.webm';

    console.log('🎥 Triggering Video Analysis for Recent Session');
    console.log('===============================================');
    console.log('Session ID:', sessionId);
    console.log('User ID:', userId);
    console.log('Video URI:', videoUri);
    console.log('');

    // Call the video analysis API directly
    const response = await fetch('http://localhost:3000/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_SECRET_KEY
      },
      body: JSON.stringify({
        sessionId,
        userId,
        videoUri
      })
    });

    console.log('Response Status:', response.status);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Video analysis triggered successfully!');
      
      // Show key results
      if (result.videoAnalysis) {
        console.log('\n📊 Analysis Summary:');
        console.log('- Face Detection:', result.videoAnalysis.faceDetection?.detected ? '✅ Detected' : '❌ Not detected');
        console.log('- Speech Analysis:', result.videoAnalysis.speechTranscription?.hasAudio ? '✅ Audio found' : '❌ No audio');
        console.log('- Person Detection:', result.videoAnalysis.personDetection?.detected ? '✅ Detected' : '❌ Not detected');
        console.log('- Overall Confidence:', result.videoAnalysis.confidence || 'N/A');
        
        if (result.videoAnalysis.speechTranscription?.transcript) {
          console.log('- Transcript:', `"${result.videoAnalysis.speechTranscription.transcript}"`);
        }
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Video analysis failed:');
      console.log('Status:', response.status);
      console.log('Error:', errorText);
      
      if (response.status === 401) {
        console.log('\n🔍 Authentication Issue Confirmed:');
        console.log('The API is still returning 401 errors, indicating authentication problems persist.');
      }
    }

  } catch (error) {
    console.error('❌ Error triggering video analysis:', error);
  }
}

triggerRecentVideoAnalysis();
