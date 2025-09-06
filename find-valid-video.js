// Script to find a valid video URI in the database
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findValidVideoUri() {
  try {
    // Try to find a recording with gs:// URL
    const gsRecording = await prisma.recording.findFirst({
      where: {
        url: {
          startsWith: 'gs://'
        }
      }
    });
    
    if (gsRecording) {
      console.log('Found recording with gs:// URL:', gsRecording.url);
      console.log('Session ID:', gsRecording.sessionId);
      return;
    }
    
    // Try to find any recording
    const anyRecording = await prisma.recording.findFirst();
    
    if (anyRecording) {
      console.log('Found recording with URL:', anyRecording.url);
      console.log('Session ID:', anyRecording.sessionId);
    } else {
      console.log('No recordings found in database');
    }
  } catch (error) {
    console.error('Error finding video URI:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findValidVideoUri();
