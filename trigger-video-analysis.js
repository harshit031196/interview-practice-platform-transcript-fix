// Script to manually trigger video analysis for the latest session
const fetch = require('node-fetch');

async function triggerVideoAnalysis() {
  try {
    const sessionId = 'cmexzx1n70005qixufv973oxh';
    const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmexzx1n70005qixufv973oxh/1756542300640_interview_cmexzx1n70005qixufv973oxh_1756542300160.webm';
    
    console.log('🚀 Triggering video analysis...');
    console.log('Session ID:', sessionId);
    console.log('Video URI:', videoUri);
    
    const response = await fetch('http://localhost:3003/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=your-session-token' // This would need actual session
      },
      body: JSON.stringify({
        videoUri: videoUri,
        sessionId: sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Video analysis triggered successfully:', result);
    } else {
      const errorText = await response.text();
      console.log('❌ Video analysis failed:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('❌ Error triggering analysis:', error);
  }
}

// Run the trigger
triggerVideoAnalysis().catch(console.error);
