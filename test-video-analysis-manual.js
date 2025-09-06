// Manual test to trigger video analysis for the latest session
const fetch = require('node-fetch');

async function testVideoAnalysis() {
  try {
    const sessionId = 'cmexzx1n70005qixufv973oxh';
    const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmexzx1n70005qixufv973oxh/1756542300640_interview_cmexzx1n70005qixufv973oxh_1756542300160.webm';
    
    console.log('🧪 Testing video analysis API directly...');
    console.log('Session ID:', sessionId);
    console.log('Video URI:', videoUri);
    
    const response = await fetch('http://localhost:3003/api/video-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        videoUri: videoUri,
        sessionId: sessionId,
        analysisType: 'comprehensive'
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Video analysis successful:', result);
    } else {
      const errorText = await response.text();
      console.log('❌ Video analysis failed:');
      console.log('Status:', response.status);
      console.log('Error:', errorText);
      
      // Check if it's an authentication issue
      if (response.status === 401) {
        console.log('\n💡 This appears to be an authentication issue.');
        console.log('The video analysis API requires a valid session.');
        console.log('This explains why it didn\'t trigger automatically during the interview.');
      }
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

// Run the test
testVideoAnalysis().catch(console.error);
