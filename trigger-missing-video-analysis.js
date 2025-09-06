const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

async function triggerMissingVideoAnalysis() {
  try {
    const sessionId = 'cmey7901m000111zb8q3zok14';
    const userId = 'cmexwu4d50000atgub3z63fdc';
    const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey7901m000111zb8q3zok14/1756554618919_interview_cmey7901m000111zb8q3zok14_1756554618146.webm';

    console.log('🎥 Manually Triggering Video Analysis');
    console.log('====================================');
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
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Video analysis triggered successfully!');
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      const errorText = await response.text();
      console.log('❌ Video analysis failed:');
      console.log('Status:', response.status);
      console.log('Error:', errorText);
    }

  } catch (error) {
    console.error('❌ Error triggering video analysis:', error);
  }
}

triggerMissingVideoAnalysis();
