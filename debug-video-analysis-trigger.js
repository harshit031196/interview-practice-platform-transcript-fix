require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
let chalk;
(async () => {
  const { default: chalkDefault } = await import('chalk');
  chalk = chalkDefault;
})();
const crypto = require('crypto');
const readline = require('readline');

// Initialize Prisma client
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
  ],
});

// Configuration
const API_BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const API_SECRET_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY;

// Logging setup
const log = {
  info: (message) => console.log(chalk.blue(`[INFO] ${message}`)),
  success: (message) => console.log(chalk.green(`[SUCCESS] ${message}`)),
  error: (message) => console.log(chalk.red(`[ERROR] ${message}`)),
  warning: (message) => console.log(chalk.yellow(`[WARNING] ${message}`)),
  step: (message) => console.log(chalk.cyan(`\n[STEP] ${message}`)),
  auth: (message) => console.log(chalk.magenta(`[AUTH] ${message}`)),
  api: (message) => console.log(chalk.bgBlue.white(`[API] ${message}`)),
  db: (message) => console.log(chalk.bgGreen.black(`[DB] ${message}`)),
};

// Log Prisma queries
prisma.$on('query', (e) => {
  log.db(`Query: ${e.query} (${e.duration}ms)`);
});

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt for input
const prompt = (question) => new Promise((resolve) => rl.question(question, resolve));

// Function to validate a session
async function validateSession(sessionToken) {
  try {
    log.step('Validating session token');
    log.info(`Session token: ${sessionToken.substring(0, 10)}...`);
    
    const dbSession = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true },
    });
    
    if (!dbSession) {
      log.error('Session not found in database');
      return { valid: false, reason: 'Session not found' };
    }
    
    if (dbSession.expires < new Date()) {
      log.error(`Session expired at ${dbSession.expires}`);
      return { valid: false, reason: 'Session expired' };
    }
    
    log.success(`Session valid for user: ${dbSession.user.email}`);
    log.info(`Session expires: ${dbSession.expires}`);
    return { 
      valid: true, 
      userId: dbSession.userId,
      email: dbSession.user.email,
      expires: dbSession.expires
    };
  } catch (error) {
    log.error(`Session validation error: ${error.message}`);
    return { valid: false, reason: error.message };
  }
}

// Function to create a test session
async function createTestSession(userId) {
  try {
    log.step('Creating test database session');
    
    // Generate session token and expiry
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    // Create session in database
    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
      },
    });
    
    log.success(`Test session created with token: ${sessionToken.substring(0, 10)}...`);
    return { sessionToken, expires };
  } catch (error) {
    log.error(`Failed to create test session: ${error.message}`);
    throw error;
  }
}

// Function to find a recent interview session
async function findRecentSession() {
  try {
    log.step('Finding recent interview session');
    
    const session = await prisma.interviewSession.findFirst({
      where: {
        status: 'COMPLETED',
        recording: {
          isNot: null
        }
      },
      orderBy: { updatedAt: 'desc' },
      include: { interviewee: true }
    });
    
    if (!session) {
      log.error('No recent completed interview sessions found with video URI');
      return null;
    }
    
    log.success(`Found session: ${session.id}`);
    log.info(`Session details:
      - Created: ${session.createdAt}
      - Updated: ${session.updatedAt}
      - User: ${session.interviewee.email}
      - Video URI: ${session.videoUri ? 'Present' : 'Missing'}
    `);
    
    return session;
  } catch (error) {
    log.error(`Error finding recent session: ${error.message}`);
    return null;
  }
}

// Function to trigger video analysis with session cookie
async function triggerVideoAnalysisWithSession(videoUri, sessionId, sessionToken) {
  try {
    log.step('Triggering video analysis with session cookie');
    log.info(`Video URI: ${videoUri}`);
    log.info(`Session ID: ${sessionId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${sessionToken}`
      },
      body: JSON.stringify({
        videoUri,
        sessionId,
        analysisType: 'comprehensive',
        debugCall: true
      })
    });
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { rawResponse: responseText };
    }
    
    if (response.ok) {
      log.success(`Video analysis triggered successfully with status: ${response.status}`);
      log.info(`Response: ${JSON.stringify(responseData, null, 2).substring(0, 200)}...`);
      return { success: true, data: responseData };
    } else {
      log.error(`Video analysis trigger failed with status: ${response.status}`);
      log.error(`Response: ${JSON.stringify(responseData, null, 2)}`);
      return { success: false, status: response.status, data: responseData };
    }
  } catch (error) {
    log.error(`Error triggering video analysis: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Function to trigger video analysis with API key
async function triggerVideoAnalysisWithApiKey(videoUri, sessionId) {
  try {
    log.step('Triggering video analysis with API key');
    
    if (!API_SECRET_KEY) {
      log.error('API_SECRET_KEY not set in environment');
      return { success: false, error: 'API_SECRET_KEY not set' };
    }
    
    log.info(`Video URI: ${videoUri}`);
    log.info(`Session ID: ${sessionId}`);
    
    const response = await fetch(`${API_BASE_URL}/api/video-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_SECRET_KEY}`
      },
      body: JSON.stringify({
        videoUri,
        sessionId,
        analysisType: 'comprehensive',
        debugCall: true
      })
    });
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { rawResponse: responseText };
    }
    
    if (response.ok) {
      log.success(`Video analysis triggered successfully with API key, status: ${response.status}`);
      log.info(`Response: ${JSON.stringify(responseData, null, 2).substring(0, 200)}...`);
      return { success: true, data: responseData };
    } else {
      log.error(`Video analysis trigger failed with API key, status: ${response.status}`);
      log.error(`Response: ${JSON.stringify(responseData, null, 2)}`);
      return { success: false, status: response.status, data: responseData };
    }
  } catch (error) {
    log.error(`Error triggering video analysis with API key: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Function to check if video analysis exists for a session
async function checkVideoAnalysisExists(sessionId, userId) {
  try {
    log.step('Checking if video analysis exists for session');
    
    const analysis = await prisma.videoAnalysis.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId
        }
      }
    });
    
    if (analysis) {
      log.success(`Video analysis found for session ${sessionId}`);
      log.info(`Analysis ID: ${analysis.id}`);
      log.info(`Created: ${analysis.createdAt}`);
      log.info(`Updated: ${analysis.updatedAt}`);
      return true;
    } else {
      log.warning(`No video analysis found for session ${sessionId}`);
      return false;
    }
  } catch (error) {
    log.error(`Error checking video analysis: ${error.message}`);
    return false;
  }
}

// Main function to run the debug flow
async function runDebugFlow() {
  // Wait for chalk to be imported
  while (!chalk) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try {
    console.log(chalk.bgWhite.black('\n VIDEO ANALYSIS TRIGGER DEBUGGER \n'));
    
    // Find a recent session with video URI
    const recentSession = await findRecentSession();
    if (!recentSession) {
      log.error('Cannot proceed without a valid session');
      return;
    }
    
    // Check if video analysis already exists
    const analysisExists = await checkVideoAnalysisExists(
      recentSession.id, 
      recentSession.intervieweeId
    );
    
    // Create a test session for the user
    const { sessionToken } = await createTestSession(recentSession.intervieweeId);
    
    // Validate the session
    const sessionValidation = await validateSession(sessionToken);
    if (!sessionValidation.valid) {
      log.error('Cannot proceed with invalid session');
      return;
    }
    
    // Try triggering video analysis with session cookie
    const sessionResult = await triggerVideoAnalysisWithSession(
      recentSession.videoUri,
      recentSession.id,
      sessionToken
    );
    
    // If session-based trigger fails, try with API key
    if (!sessionResult.success) {
      log.warning('Session-based trigger failed, trying with API key');
      const apiKeyResult = await triggerVideoAnalysisWithApiKey(
        recentSession.videoUri,
        recentSession.id
      );
      
      if (!apiKeyResult.success) {
        log.error('Both session and API key triggers failed');
      }
    }
    
    // Check if video analysis was created
    log.step('Waiting 5 seconds before checking for video analysis creation');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalCheck = await checkVideoAnalysisExists(
      recentSession.id, 
      recentSession.intervieweeId
    );
    
    if (finalCheck && !analysisExists) {
      log.success('Video analysis was successfully created during this debug session');
    } else if (finalCheck && analysisExists) {
      log.info('Video analysis already existed and still exists');
    } else {
      log.error('Video analysis was not created during this debug session');
    }
    
  } catch (error) {
    log.error(`Debug flow error: ${error.message}`);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

// Run the debug flow
runDebugFlow();
