require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'info', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Configure logging
const LOG_FILE = path.join(__dirname, 'logs', 'auth-video-debug.log');
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Log function
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  
  // Color coding for console
  let colorCode;
  switch(type) {
    case 'ERROR':
      colorCode = '\x1b[31m'; // Red
      break;
    case 'AUTH':
      colorCode = '\x1b[36m'; // Cyan
      break;
    case 'VIDEO':
      colorCode = '\x1b[35m'; // Magenta
      break;
    case 'DB':
      colorCode = '\x1b[33m'; // Yellow
      break;
    case 'SUCCESS':
      colorCode = '\x1b[32m'; // Green
      break;
    default:
      colorCode = '\x1b[0m'; // Default
  }
  
  console.log(`${colorCode}${logEntry.trim()}\x1b[0m`);
}

// Set up Prisma logging
prisma.$on('query', (e) => {
  log(`Query: ${e.query}`, 'DB');
});

prisma.$on('error', (e) => {
  log(`Database Error: ${e.message}`, 'ERROR');
});

// Create WebSocket server for browser logs
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Interview Platform Debug Console</title>
          <style>
            body { font-family: monospace; margin: 0; padding: 20px; background: #1e1e1e; color: #ddd; }
            .log { margin-bottom: 5px; border-bottom: 1px solid #333; padding: 5px 0; }
            .error { color: #ff5555; }
            .auth { color: #55aaff; }
            .video { color: #ff55ff; }
            .db { color: #ffaa55; }
            .success { color: #55ff55; }
            #controls { position: fixed; top: 0; right: 0; background: #333; padding: 10px; }
            button { margin: 5px; padding: 5px 10px; }
          </style>
        </head>
        <body>
          <h1>Interview Platform Debug Console</h1>
          <div id="controls">
            <button onclick="testAuth()">Test Auth</button>
            <button onclick="testVideoAnalysis()">Test Video Analysis</button>
            <button onclick="clearLogs()">Clear Logs</button>
          </div>
          <div id="logs"></div>
          <script>
            const ws = new WebSocket('ws://' + location.host + '/ws');
            ws.onmessage = (event) => {
              const log = JSON.parse(event.data);
              const logDiv = document.createElement('div');
              logDiv.className = 'log ' + log.type.toLowerCase();
              logDiv.textContent = \`[\${log.timestamp}] [\${log.type}] \${log.message}\`;
              document.getElementById('logs').prepend(logDiv);
            };
            
            function testAuth() {
              fetch('/test-auth', { method: 'POST' })
                .then(res => res.text())
                .then(text => console.log(text))
                .catch(err => console.error(err));
            }
            
            function testVideoAnalysis() {
              fetch('/test-video', { method: 'POST' })
                .then(res => res.text())
                .then(text => console.log(text))
                .catch(err => console.error(err));
            }
            
            function clearLogs() {
              document.getElementById('logs').innerHTML = '';
            }
          </script>
        </body>
      </html>
    `);
  } else if (req.url === '/test-auth' && req.method === 'POST') {
    testNextAuthSession();
    res.writeHead(200);
    res.end('Testing auth session...');
  } else if (req.url === '/test-video' && req.method === 'POST') {
    testVideoAnalysisAPI();
    res.writeHead(200);
    res.end('Testing video analysis...');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  log('Browser client connected', 'INFO');
  
  // Send existing logs
  const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  logs.forEach(logLine => {
    const match = logLine.match(/\[(.*?)\] \[(.*?)\] (.*)/);
    if (match) {
      ws.send(JSON.stringify({
        timestamp: match[1],
        type: match[2],
        message: match[3]
      }));
    }
  });
});

// Broadcast log to all connected clients
function broadcastLog(message, type) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        timestamp: new Date().toISOString(),
        type,
        message
      }));
    }
  });
}

// Monitor NextAuth session creation
async function monitorNextAuthSessions() {
  log('Starting NextAuth session monitoring...', 'AUTH');
  
  try {
    // Check for existing sessions
    const sessions = await prisma.session.findMany({
      orderBy: { expires: 'desc' },
      take: 10,
      include: {
        user: true
      }
    });
    
    log(`Found ${sessions.length} active sessions`, 'AUTH');
    
    sessions.forEach((session, index) => {
      const expiresIn = new Date(session.expires) - new Date();
      const expiresInHours = Math.round(expiresIn / (1000 * 60 * 60) * 10) / 10;
      
      log(`Session ${index + 1}:`, 'AUTH');
      log(`  ID: ${session.id}`, 'AUTH');
      log(`  User: ${session.user?.email || 'Unknown'}`, 'AUTH');
      log(`  Token: ${session.sessionToken.substring(0, 10)}...`, 'AUTH');
      log(`  Expires: ${session.expires} (in ${expiresInHours} hours)`, 'AUTH');
    });
    
    // Set up session change monitoring
    setInterval(async () => {
      try {
        const newSessions = await prisma.session.findMany({
          where: {
            createdAt: {
              gt: new Date(Date.now() - 60000) // Sessions created in the last minute
            }
          },
          include: {
            user: true
          }
        });
        
        if (newSessions.length > 0) {
          log(`Detected ${newSessions.length} new sessions`, 'AUTH');
          
          newSessions.forEach(session => {
            log(`New session created:`, 'SUCCESS');
            log(`  ID: ${session.id}`, 'SUCCESS');
            log(`  User: ${session.user?.email || 'Unknown'}`, 'SUCCESS');
            log(`  Token: ${session.sessionToken.substring(0, 10)}...`, 'SUCCESS');
          });
        }
      } catch (error) {
        log(`Error monitoring sessions: ${error.message}`, 'ERROR');
      }
    }, 5000);
    
  } catch (error) {
    log(`Error accessing sessions: ${error.message}`, 'ERROR');
  }
}

// Test NextAuth session creation
async function testNextAuthSession() {
  log('Testing NextAuth session creation...', 'AUTH');
  
  try {
    // Check if test user exists
    const testUser = await prisma.user.findUnique({
      where: {
        email: 'pm.candidate@example.com'
      }
    });
    
    if (!testUser) {
      log('Test user not found. Creating test user...', 'AUTH');
      // Create test user if not exists
      await prisma.user.create({
        data: {
          email: 'pm.candidate@example.com',
          name: 'PM Candidate',
          role: 'CANDIDATE'
        }
      });
      log('Test user created', 'SUCCESS');
    } else {
      log(`Found test user: ${testUser.email} (${testUser.id})`, 'AUTH');
    }
    
    // Create direct database session
    const crypto = require('crypto');
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    
    const userId = testUser?.id || (await prisma.user.findUnique({ where: { email: 'pm.candidate@example.com' } })).id;
    
    log(`Creating direct database session for user ${userId}...`, 'AUTH');
    
    const session = await prisma.session.create({
      data: {
        sessionToken,
        userId,
        expires,
      },
    });
    
    log(`Direct database session created:`, 'SUCCESS');
    log(`  ID: ${session.id}`, 'SUCCESS');
    log(`  Token: ${sessionToken.substring(0, 10)}...`, 'SUCCESS');
    log(`  Expires: ${expires}`, 'SUCCESS');
    
    return session;
  } catch (error) {
    log(`Error creating test session: ${error.message}`, 'ERROR');
    return null;
  }
}

// Monitor video analysis API
async function monitorVideoAnalysisAPI() {
  log('Starting video analysis API monitoring...', 'VIDEO');
  
  try {
    // Check for recent video analyses
    const analyses = await prisma.videoAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    log(`Found ${analyses.length} recent video analyses`, 'VIDEO');
    
    analyses.forEach((analysis, index) => {
      log(`Analysis ${index + 1}:`, 'VIDEO');
      log(`  ID: ${analysis.id}`, 'VIDEO');
      log(`  Session: ${analysis.sessionId}`, 'VIDEO');
      log(`  Status: ${analysis.status}`, 'VIDEO');
      log(`  Created: ${analysis.createdAt}`, 'VIDEO');
      log(`  Video URI: ${analysis.videoUri?.substring(0, 30)}...`, 'VIDEO');
    });
    
    // Set up video analysis monitoring
    setInterval(async () => {
      try {
        const newAnalyses = await prisma.videoAnalysis.findMany({
          where: {
            createdAt: {
              gt: new Date(Date.now() - 60000) // Analyses created in the last minute
            }
          }
        });
        
        if (newAnalyses.length > 0) {
          log(`Detected ${newAnalyses.length} new video analyses`, 'VIDEO');
          
          newAnalyses.forEach(analysis => {
            log(`New video analysis created:`, 'SUCCESS');
            log(`  ID: ${analysis.id}`, 'SUCCESS');
            log(`  Session: ${analysis.sessionId}`, 'SUCCESS');
            log(`  Status: ${analysis.status}`, 'SUCCESS');
          });
        }
      } catch (error) {
        log(`Error monitoring video analyses: ${error.message}`, 'ERROR');
      }
    }, 5000);
    
  } catch (error) {
    log(`Error accessing video analyses: ${error.message}`, 'ERROR');
  }
}

// Test video analysis API
async function testVideoAnalysisAPI() {
  log('Testing video analysis API...', 'VIDEO');
  
  try {
    // Create test session if needed
    const session = await testNextAuthSession();
    if (!session) {
      log('Failed to create test session for video analysis', 'ERROR');
      return;
    }
    
    // Create test interview session
    log('Creating test interview session...', 'VIDEO');
    const interviewSession = await prisma.interviewSession.create({
      data: {
        type: 'AI',
        status: 'COMPLETED',
        userId: session.userId,
        settings: {
          interviewType: 'behavioral',
          difficulty: 'medium',
          duration: 15,
          isConversational: true
        }
      }
    });
    
    log(`Test interview session created: ${interviewSession.id}`, 'SUCCESS');
    
    // Test video URI
    const videoUri = `gs://wingman-interview-videos-harshit-2024/interviews/${session.userId}/${interviewSession.id}/test-video.webm`;
    
    log(`Using test video URI: ${videoUri}`, 'VIDEO');
    
    // Update interview session with video URI
    await prisma.interviewSession.update({
      where: { id: interviewSession.id },
      data: { videoUri }
    });
    
    log('Interview session updated with video URI', 'SUCCESS');
    
    // Create video analysis record
    log('Creating video analysis record...', 'VIDEO');
    const videoAnalysis = await prisma.videoAnalysis.create({
      data: {
        sessionId: interviewSession.id,
        videoUri,
        status: 'PENDING',
        analysisType: 'comprehensive'
      }
    });
    
    log(`Video analysis record created: ${videoAnalysis.id}`, 'SUCCESS');
    log('Video analysis test completed successfully', 'SUCCESS');
    
    return videoAnalysis;
  } catch (error) {
    log(`Error testing video analysis API: ${error.message}`, 'ERROR');
    return null;
  }
}

// Monitor UnifiedInterviewSession component
function monitorUnifiedInterviewSession() {
  log('Starting UnifiedInterviewSession component monitoring...', 'INFO');
  
  // Check the component file
  try {
    const componentPath = path.join(__dirname, 'components', 'UnifiedInterviewSession.tsx');
    const componentContent = fs.readFileSync(componentPath, 'utf8');
    
    // Check for key functions
    const hasEnsureValidSession = componentContent.includes('ensureValidSession');
    const hasTriggerVideoAnalysis = componentContent.includes('triggerVideoAnalysisWithRetry');
    
    log(`UnifiedInterviewSession component analysis:`, 'INFO');
    log(`  Has ensureValidSession: ${hasEnsureValidSession ? 'Yes' : 'No'}`, hasEnsureValidSession ? 'SUCCESS' : 'ERROR');
    log(`  Has triggerVideoAnalysisWithRetry: ${hasTriggerVideoAnalysis ? 'Yes' : 'No'}`, hasTriggerVideoAnalysis ? 'SUCCESS' : 'ERROR');
    
    // Check for session handling
    if (componentContent.includes('getSession')) {
      log('  Uses getSession() for client-side session retrieval', 'SUCCESS');
    } else {
      log('  Missing getSession() for client-side session retrieval', 'ERROR');
    }
    
    // Check for credentials
    if (componentContent.includes('credentials: \'include\'')) {
      log('  Properly includes credentials in fetch requests', 'SUCCESS');
    } else {
      log('  Missing credentials in fetch requests', 'ERROR');
    }
    
  } catch (error) {
    log(`Error analyzing UnifiedInterviewSession component: ${error.message}`, 'ERROR');
  }
}

// Start the server
const PORT = 3456;
server.listen(PORT, () => {
  log(`Debug server running at http://localhost:${PORT}`, 'SUCCESS');
  log(`Log file: ${LOG_FILE}`, 'INFO');
  
  // Start monitoring
  monitorNextAuthSessions();
  monitorVideoAnalysisAPI();
  monitorUnifiedInterviewSession();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('Shutting down debug server...', 'INFO');
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});
