const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Initialize Prisma client
const prisma = new PrismaClient();

// Configuration
const API_URL = 'http://localhost:3000/api/ai/speech-analysis';
const TEST_AUDIO_PATH = path.join(__dirname, 'test-audio.webm'); // Change this to your test audio file
const TEST_INTERVIEW_ID = '1234567890'; // Change this to a valid interview ID

// Create a sample audio file if it doesn't exist
async function createSampleAudioFileIfNeeded() {
  if (!fs.existsSync(TEST_AUDIO_PATH)) {
    console.log('Creating a sample test audio file...');
    
    // This is a very small valid WebM file (not actually containing audio)
    // but it will work for testing purposes
    const MINIMAL_WEBM = Buffer.from([
      0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f,
      0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
      0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d
    ]);
    
    fs.writeFileSync(TEST_AUDIO_PATH, MINIMAL_WEBM);
    console.log(`Created test audio file at ${TEST_AUDIO_PATH}`);
  }
}

// Test submitting speech analysis job
async function testSubmitSpeechAnalysis() {
  try {
    await createSampleAudioFileIfNeeded();
    
    console.log('Testing speech analysis job submission...');
    
    // Get a test user to associate with the job
    let user = await prisma.user.findFirst();
    
    if (!user) {
      console.log('No user found. Creating a test user...');
      user = await prisma.user.create({
        data: {
          email: 'test-speech@example.com',
          name: 'Speech Test User',
          role: 'INTERVIEWER'
        }
      });
    }
    
    console.log(`Using user: ${user.id} (${user.email})`);
    
    // Create form data with audio file
    const form = new FormData();
    form.append('audio', fs.createReadStream(TEST_AUDIO_PATH));
    form.append('interviewId', TEST_INTERVIEW_ID);
    
    // Find or create a session cookie for authentication
    let sessionCookie = '';
    const session = await prisma.session.findFirst({
      where: { userId: user.id }
    });
    
    if (!session) {
      console.log('Creating a test session...');
      const newSession = await prisma.session.create({
        data: {
          sessionToken: `test-speech-${Date.now()}`,
          userId: user.id,
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24) // 1 day
        }
      });
      sessionCookie = `next-auth.session-token=${newSession.sessionToken}`;
    } else {
      sessionCookie = `next-auth.session-token=${session.sessionToken}`;
    }
    
    // Submit the job
    console.log('Submitting audio file for analysis...');
    const response = await fetch(API_URL, {
      method: 'POST',
      body: form,
      headers: {
        Cookie: sessionCookie
      }
    });
    
    const result = await response.json();
    console.log('Response:', result);
    
    if (result.operationName) {
      // Check status after a few seconds
      console.log(`Job submitted! Operation name: ${result.operationName}`);
      console.log(`Waiting 5 seconds to check status...`);
      
      setTimeout(async () => {
        const statusResponse = await fetch(
          `${API_URL}?operationName=${result.operationName}`,
          {
            headers: {
              Cookie: sessionCookie
            }
          }
        );
        
        const statusResult = await statusResponse.json();
        console.log('Status:', statusResult);
        
        // Check the database for the job
        const job = await prisma.speechAnalysisJob.findFirst({
          where: {
            userId: user.id,
            operationName: result.operationName
          }
        });
        
        console.log('Database record:', job || 'No job found in database');
        
        await prisma.$disconnect();
      }, 5000);
    } else {
      console.error('Failed to submit job:', result);
      await prisma.$disconnect();
    }
    
  } catch (error) {
    console.error('Error testing speech analysis:', error);
    await prisma.$disconnect();
  }
}

// Run the test
testSubmitSpeechAnalysis();
