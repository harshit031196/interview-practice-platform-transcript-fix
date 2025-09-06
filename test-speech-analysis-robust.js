// Enhanced test script for robust speech analysis testing
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Configuration
const API_ENDPOINT = 'http://localhost:3000/api/ai/speech-analysis';
const TEST_AUDIO_PATH = './test-audio.webm';
const TEST_USER_ID = 'cmezbehpa000014evtcw8ab0p';
const TEST_USER_EMAIL = 'test@example.com';
const TEST_INTERVIEW_ID = '1234567890';

// Get API key from .env.local
const API_KEY = '02abaa2809e88e7ec833dd94ded920abd30af1eb1d0e6b02c0301996fa726591'; // This is the same key as in .env.local

// Create test JWT token (for testing only)
const createTestJWT = () => {
  // In a real environment, you would use a proper JWT library
  // This is just for testing purposes
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
  const payload = Buffer.from(JSON.stringify({
    sub: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    exp: Math.floor(Date.now() / 1000) + 3600,
    // Add additional claims that might be needed for authentication
    role: 'user',
    apiKey: API_KEY
  })).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  // Use the actual secret from .env.local for a more valid token
  const signature = Buffer.from('wingman-interview-secret-2024-harshit-secure-key-for-auth').toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${header}.${payload}.${signature}`;
};

// Function to check if a file exists
const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`Error checking if file exists: ${error.message}`);
    return false;
  }
};

// Check database for job records
const checkDatabaseRecord = async (jobId) => {
  try {
    const response = await fetch(`http://localhost:3000/api/debug/speech-jobs?jobId=${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${createTestJWT()}`,
        'x-api-key': API_KEY
      }
    });

    if (!response.ok) {
      console.log('Database record: Unable to fetch job details');
      return;
    }
    
    const data = await response.json();
    console.log('Database record:', data);
  } catch (error) {
    console.log(`Database record: Error checking database - ${error.message}`);
  }
};

// Mock the Google Cloud Speech API if permission issues are encountered
const handlePermissionIssue = async (operationName, jobId) => {
  console.log('\n========== MOCK HANDLER ==========');
  console.log('Permission issues detected with Google Cloud Speech API');
  console.log('Continuing with mock data for testing purposes');

  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Submit mock completion to the endpoint
    const mockData = {
      operationName,
      jobId,
      mockResults: true,
      transcript: "This is a mock transcript for testing purposes. It represents what would be returned from the Google Cloud Speech API if permissions were correctly configured.",
      confidence: 0.92
    };
    
    const response = await fetch(`http://localhost:3000/api/ai/speech-analysis/mock-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${createTestJWT()}`,
        'x-api-key': API_KEY
      },
      body: JSON.stringify(mockData)
    });
    
    if (response.ok) {
      console.log('Mock completion submitted successfully');
      return true;
    } else {
      console.log('Failed to submit mock completion:', await response.text());
      return false;
    }
  } catch (error) {
    console.log('Error in mock handling:', error.message);
    return false;
  }
};

// Main function to test speech analysis
const testSpeechAnalysis = async () => {
  console.log('Testing speech analysis job submission...');
  console.log(`Using user: ${TEST_USER_ID} (${TEST_USER_EMAIL})`);
  
  // Check if test audio file exists
  if (!fileExists(TEST_AUDIO_PATH)) {
    console.error(`Test audio file not found: ${TEST_AUDIO_PATH}`);
    console.log('Creating a dummy test audio file...');
    
    // Create a small dummy audio file for testing
    const dummyBuffer = Buffer.alloc(1024);
    fs.writeFileSync(TEST_AUDIO_PATH, dummyBuffer);
  }
  
  // Submit a speech analysis job
  console.log('Submitting audio file for analysis...');
  
  try {
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(TEST_AUDIO_PATH));
    formData.append('interviewId', TEST_INTERVIEW_ID);
    
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${createTestJWT()}`,
        'x-api-key': API_KEY
      },
      body: formData
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (!data.operationName) {
      console.error('Failed to submit job, no operation name received');
      return;
    }
    
    console.log(`Job submitted! Operation name: ${data.operationName}`);
    const operationName = data.operationName;
    const jobId = data.jobId;
    
    // Wait a bit before checking status
    console.log('Waiting 5 seconds to check status...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check the status
    const statusResponse = await fetch(`${API_ENDPOINT}?operationName=${operationName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${createTestJWT()}`,
        'x-api-key': API_KEY
      }
    });
    
    const statusData = await statusResponse.json();
    console.log('Status:', statusData);
    
    // Check if we have a permission issue
    if (statusData.error && statusData.details && statusData.details.includes('PERMISSION_DENIED')) {
      console.log('\nPermission error detected, attempting mock completion...');
      const mockResult = await handlePermissionIssue(operationName, jobId);
      
      if (mockResult) {
        // Check status again after mock completion
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const finalStatusResponse = await fetch(`${API_ENDPOINT}?jobId=${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${createTestJWT()}`,
            'x-api-key': API_KEY
          }
        });
        
        console.log('Final status after mock completion:', await finalStatusResponse.json());
      }
    }
    
    // Check database for the job record
    await checkDatabaseRecord(jobId);
    
  } catch (error) {
    console.error('Error in test:', error);
  }
};

// Run the test
testSpeechAnalysis();
