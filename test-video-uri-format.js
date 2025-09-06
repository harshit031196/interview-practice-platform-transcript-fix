// Test script to verify video URI format and Video Intelligence API access
require('dotenv').config({ path: '.env.local' });
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');

// Initialize the client
const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});

// Test function to check video URI format and API access
async function testVideoAnalysis() {
  try {
    console.log('🔍 Testing Video Intelligence API access');
    
    // Get a recent video URI from the logs
    const testVideoUri = 'https://storage.cloud.google.com/wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey7ql0v000911zba3x6s4ec/1756555450302_interview_cmey7ql0v000911zba3x6s4ec_1756555449782.webm';
    
    console.log('Original video URI:', testVideoUri);
    
    // Convert web URL to GCS URI if needed
    let gcsUri = testVideoUri;
    if (testVideoUri.startsWith('https://storage.cloud.google.com/')) {
      gcsUri = 'gs://' + testVideoUri.replace('https://storage.cloud.google.com/', '');
      console.log('Converted to GCS URI:', gcsUri);
    }
    
    // Check service account authentication
    try {
      const [projectId] = await videoClient.getProjectId();
      console.log('✅ Authenticated with project ID:', projectId);
    } catch (authError) {
      console.error('❌ Authentication error:', authError);
      return;
    }
    
    // Test a simple face detection request
    console.log('📊 Sending test request to Video Intelligence API...');
    const [operation] = await videoClient.annotateVideo({
      inputUri: gcsUri,
      features: ['FACE_DETECTION'],
    });
    
    console.log('✅ Request accepted! Operation name:', operation.name);
    console.log('⏳ Waiting for operation to complete (this may take several minutes)...');
    
    // Wait for operation to complete
    const [response] = await operation.promise();
    
    // Check results
    if (response && response.annotationResults && response.annotationResults.length > 0) {
      const faceAnnotations = response.annotationResults[0].faceDetectionAnnotations || [];
      console.log('✅ Analysis complete!');
      console.log('📊 Results:');
      console.log(`- Face detections: ${faceAnnotations.length}`);
      
      if (faceAnnotations.length > 0) {
        console.log('- First face confidence:', faceAnnotations[0].tracks[0].confidence);
      } else {
        console.log('- No faces detected in the video');
      }
    } else {
      console.log('❌ No annotation results returned');
    }
  } catch (error) {
    console.error('❌ Error testing Video Intelligence API:', error);
  }
}

// Run the test
testVideoAnalysis();
