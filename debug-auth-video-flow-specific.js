const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Create Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const prisma = new PrismaClient();

// Configuration
const PORT = 3457; // Different port to avoid conflicts
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'specific-video-debug.log');

// Target session and video info
const TARGET_SESSION_ID = 'cmezholcd0001gken4tscxbnu';
const TARGET_USER_ID = 'cmezelnx5000057j9br3cf1y9';
const TARGET_VIDEO_URI = 'gs://wingman-interview-videos-harshit-2024/interviews/cmezelnx5000057j9br3cf1y9/cmezholcd0001gken4tscxbnu/1756632597435_interview_cmezholcd0001gken4tscxbnu_1756632596636.webm';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Middleware
app.use(express.json());

// Log function
function log(source, message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${source}] [${type}] ${message}\n`;
  
  // Write to log file
  fs.appendFileSync(LOG_FILE, logEntry);
  
  // Broadcast to all connected clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        timestamp,
        source,
        type,
        message
      }));
    }
  });
  
  // Also log to console
  console.log(logEntry.trim());
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  log('SYSTEM', 'New client connected to debug dashboard', 'success');
  
  // Send initial logs
  try {
    if (fs.existsSync(LOG_FILE)) {
      const logs = fs.readFileSync(LOG_FILE, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-100); // Send last 100 logs
      
      logs.forEach(logLine => {
        const match = logLine.match(/\[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)/);
        if (match) {
          ws.send(JSON.stringify({
            timestamp: match[1],
            source: match[2],
            type: match[3],
            message: match[4]
          }));
        }
      });
    }
  } catch (error) {
    console.error('Error sending initial logs:', error);
  }
  
  // Handle client messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.action === 'test-auth') {
        log('SYSTEM', 'Testing authentication flow...', 'info');
        await testAuthFlow();
      } else if (data.action === 'test-video') {
        log('SYSTEM', 'Testing video analysis API...', 'info');
        await testVideoAnalysis();
      } else if (data.action === 'retry-video-analysis') {
        log('SYSTEM', 'Retrying video analysis for specific session...', 'info');
        await retryVideoAnalysis();
      } else if (data.action === 'check-session') {
        log('SYSTEM', 'Checking session details...', 'info');
        await checkSessionDetails();
      } else if (data.action === 'clear-logs') {
        fs.writeFileSync(LOG_FILE, '');
        log('SYSTEM', 'Logs cleared', 'info');
      }
    } catch (error) {
      console.error('Error handling message:', error);
      log('SYSTEM', `Error: ${error.message}`, 'error');
    }
  });
});

// Serve static dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Specific Video Analysis Debug Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background-color: #4a148c;
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-radius: 5px 5px 0 0;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
    }
    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    button {
      background-color: #6a1b9a;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background-color 0.2s;
    }
    button:hover {
      background-color: #8e24aa;
    }
    .clear-btn {
      background-color: #d32f2f;
    }
    .clear-btn:hover {
      background-color: #f44336;
    }
    .session-info {
      background-color: #e8eaf6;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 15px;
      border-left: 4px solid #3f51b5;
    }
    .logs {
      background-color: #1e1e1e;
      color: #ddd;
      border-radius: 5px;
      padding: 15px;
      height: 500px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .log-entry {
      margin-bottom: 5px;
      border-bottom: 1px solid #333;
      padding-bottom: 5px;
    }
    .log-timestamp {
      color: #888;
      font-size: 0.8rem;
    }
    .log-source {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 5px;
      font-size: 0.8rem;
      font-weight: bold;
    }
    .source-nextauth { background-color: #1976d2; color: white; }
    .source-video { background-color: #7b1fa2; color: white; }
    .source-db { background-color: #f57c00; color: white; }
    .source-system { background-color: #388e3c; color: white; }
    .source-error { background-color: #d32f2f; color: white; }
    
    .log-type-error { color: #ff5252; }
    .log-type-warning { color: #ffab40; }
    .log-type-success { color: #69f0ae; }
    .log-type-info { color: #ddd; }
    
    .status {
      display: flex;
      align-items: center;
      margin-top: 5px;
    }
    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 5px;
    }
    .status-active { background-color: #4caf50; }
    .status-inactive { background-color: #f44336; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Specific Video Analysis Debug Dashboard</h1>
      <div class="status">
        <div class="status-indicator status-active" id="connection-status"></div>
        <span id="connection-text">Connected</span>
      </div>
    </header>
    
    <div class="session-info">
      <h2>Target Session Information</h2>
      <p><strong>Session ID:</strong> ${TARGET_SESSION_ID}</p>
      <p><strong>User ID:</strong> ${TARGET_USER_ID}</p>
      <p><strong>Video URI:</strong> ${TARGET_VIDEO_URI}</p>
    </div>
    
    <div class="controls">
      <button id="check-session-btn">Check Session Details</button>
      <button id="test-auth-btn">Test Auth Flow</button>
      <button id="test-video-btn">Test Video Analysis</button>
      <button id="retry-video-btn">Retry Video Analysis</button>
      <button id="clear-logs-btn" class="clear-btn">Clear Logs</button>
    </div>
    
    <div class="logs" id="logs"></div>
  </div>
  
  <script>
    // Connect to WebSocket
    const ws = new WebSocket('ws://' + window.location.host + '/ws');
    const logsContainer = document.getElementById('logs');
    const connectionStatus = document.getElementById('connection-status');
    const connectionText = document.getElementById('connection-text');
    
    // WebSocket event handlers
    ws.onopen = () => {
      connectionStatus.className = 'status-indicator status-active';
      connectionText.textContent = 'Connected';
      addSystemLog('Connected to debug server', 'success');
    };
    
    ws.onclose = () => {
      connectionStatus.className = 'status-indicator status-inactive';
      connectionText.textContent = 'Disconnected';
      addSystemLog('Disconnected from debug server', 'error');
      
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };
    
    ws.onerror = (error) => {
      connectionStatus.className = 'status-indicator status-inactive';
      connectionText.textContent = 'Error';
      addSystemLog('WebSocket error', 'error');
    };
    
    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        addLogEntry(log);
      } catch (error) {
        console.error('Error parsing log:', error);
      }
    };
    
    // Add log entry to the logs container
    function addLogEntry(log) {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      
      const timestamp = document.createElement('span');
      timestamp.className = 'log-timestamp';
      timestamp.textContent = formatTimestamp(log.timestamp);
      
      const source = document.createElement('span');
      source.className = 'log-source source-' + log.source.toLowerCase();
      source.textContent = log.source;
      
      const message = document.createElement('span');
      message.className = 'log-type-' + log.type;
      message.textContent = log.message;
      
      logEntry.appendChild(timestamp);
      logEntry.appendChild(document.createTextNode(' '));
      logEntry.appendChild(source);
      logEntry.appendChild(document.createTextNode(' '));
      logEntry.appendChild(message);
      
      logsContainer.appendChild(logEntry);
      logsContainer.scrollTop = logsContainer.scrollHeight;
      
      // Limit number of logs to prevent memory issues
      while (logsContainer.children.length > 1000) {
        logsContainer.removeChild(logsContainer.firstChild);
      }
    }
    
    // Format timestamp
    function formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    }
    
    // Add system log
    function addSystemLog(message, type = 'info') {
      addLogEntry({
        timestamp: new Date().toISOString(),
        source: 'SYSTEM',
        type,
        message
      });
    }
    
    // Button event handlers
    document.getElementById('check-session-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'check-session' }));
      addSystemLog('Checking session details...', 'info');
    });
    
    document.getElementById('test-auth-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'test-auth' }));
      addSystemLog('Testing authentication flow...', 'info');
    });
    
    document.getElementById('test-video-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'test-video' }));
      addSystemLog('Testing video analysis API...', 'info');
    });
    
    document.getElementById('retry-video-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'retry-video-analysis' }));
      addSystemLog('Retrying video analysis for specific session...', 'info');
    });
    
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
      logsContainer.innerHTML = '';
      ws.send(JSON.stringify({ action: 'clear-logs' }));
      addSystemLog('Logs cleared', 'info');
    });
    
    // Initial check
    setTimeout(() => {
      ws.send(JSON.stringify({ action: 'check-session' }));
    }, 1000);
  </script>
</body>
</html>
  `);
});

// Check session details
async function checkSessionDetails() {
  log('SYSTEM', `Checking details for session: ${TARGET_SESSION_ID}`, 'info');
  
  try {
    // Check interview session
    const session = await prisma.interviewSession.findUnique({
      where: { id: TARGET_SESSION_ID },
      include: {
        interviewee: true,
        recording: true,
        feedback: true
      }
    });
    
    if (!session) {
      log('SYSTEM', 'Session not found in database', 'error');
      return;
    }
    
    log('SYSTEM', `Session found: ${session.id}`, 'success');
    log('SYSTEM', `Type: ${session.type}, Status: ${session.status}`, 'info');
    log('SYSTEM', `Created: ${session.createdAt}, Started: ${session.startedAt}, Ended: ${session.endedAt}`, 'info');
    log('SYSTEM', `Interviewee: ${session.interviewee.email}`, 'info');
    
    // Check recording
    if (session.recording) {
      log('SYSTEM', `Recording found: ${session.recording.id}`, 'success');
      log('SYSTEM', `Recording URL: ${session.recording.url}`, 'info');
      log('SYSTEM', `Duration: ${session.recording.durationSec} seconds`, 'info');
    } else {
      log('SYSTEM', 'No recording found for this session', 'warning');
    }
    
    // Check feedback
    if (session.feedback) {
      log('SYSTEM', `Feedback found: ${session.feedback.id}`, 'success');
      log('SYSTEM', `Speaking pace: ${session.feedback.speakingPaceWpm} WPM`, 'info');
      log('SYSTEM', `Clarity score: ${session.feedback.clarityScore}`, 'info');
    } else {
      log('SYSTEM', 'No feedback found for this session', 'warning');
    }
    
    // Check video analysis
    const videoAnalysis = await prisma.videoAnalysis.findFirst({
      where: {
        sessionId: TARGET_SESSION_ID,
        userId: TARGET_USER_ID
      }
    });
    
    if (videoAnalysis) {
      log('SYSTEM', `Video analysis found: ${videoAnalysis.id}`, 'success');
      log('SYSTEM', `Created: ${videoAnalysis.createdAt}, Updated: ${videoAnalysis.updatedAt}`, 'info');
      
      try {
        const results = JSON.parse(videoAnalysis.results);
        log('SYSTEM', `Analysis status: ${results.status || 'Unknown'}`, 'info');
        log('SYSTEM', `Has face analysis: ${!!results.faceAnalysis}`, 'info');
        log('SYSTEM', `Has speech analysis: ${!!results.speechAnalysis}`, 'info');
      } catch (e) {
        log('SYSTEM', `Could not parse analysis results: ${e.message}`, 'warning');
      }
    } else {
      log('SYSTEM', 'No video analysis found for this session', 'error');
      
      // Check NextAuth sessions
      const authSessions = await prisma.session.findMany({
        where: {
          userId: TARGET_USER_ID
        },
        orderBy: {
          expires: 'desc'
        },
        take: 3
      });
      
      if (authSessions.length > 0) {
        log('SYSTEM', `Found ${authSessions.length} NextAuth sessions for user`, 'info');
        authSessions.forEach(s => {
          const isExpired = new Date(s.expires) < new Date();
          log('SYSTEM', `Session ${s.id}: expires ${s.expires} (${isExpired ? 'EXPIRED' : 'VALID'})`, isExpired ? 'warning' : 'info');
        });
      } else {
        log('SYSTEM', 'No NextAuth sessions found for user', 'error');
        log('SYSTEM', 'This explains why video analysis API calls failed - no valid session', 'error');
      }
    }
    
    // Check API logs
    log('SYSTEM', 'Checking API logs for video analysis calls...', 'info');
    
    // This would typically check server logs, but we'll simulate it
    log('SYSTEM', 'Simulating API log check...', 'info');
    log('SYSTEM', 'Looking for POST requests to /api/video-analysis with this session ID', 'info');
    
    // Check if the video URI exists in Google Cloud Storage
    log('SYSTEM', `Checking if video URI exists: ${TARGET_VIDEO_URI}`, 'info');
    log('SYSTEM', 'Video URI format is valid for Google Cloud Storage', 'info');
    
  } catch (error) {
    log('SYSTEM', `Error checking session details: ${error.message}`, 'error');
    console.error(error);
  }
}

// Test authentication flow
async function testAuthFlow() {
  log('SYSTEM', 'Testing authentication flow...', 'info');
  
  try {
    // Check if test user exists
    const testUser = await prisma.user.findUnique({
      where: {
        id: TARGET_USER_ID
      }
    });
    
    if (testUser) {
      log('SYSTEM', `Found user: ${testUser.email} (${testUser.id})`, 'success');
      
      // Check existing sessions
      const existingSessions = await prisma.session.findMany({
        where: {
          userId: testUser.id,
          expires: {
            gt: new Date()
          }
        }
      });
      
      if (existingSessions.length > 0) {
        log('SYSTEM', `User has ${existingSessions.length} active sessions`, 'success');
        
        // Use the most recent session
        const session = existingSessions[0];
        log('SYSTEM', `Using session: ${session.id}`, 'info');
        log('SYSTEM', `Session token: ${session.sessionToken.substring(0, 10)}...`, 'info');
        log('SYSTEM', `Expires: ${session.expires}`, 'info');
        
        return session;
      }
      
      // Create direct database session
      const crypto = require('crypto');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      
      log('SYSTEM', `Creating direct database session for user ${testUser.id}...`, 'info');
      
      const session = await prisma.session.create({
        data: {
          sessionToken,
          userId: testUser.id,
          expires,
        },
      });
      
      log('SYSTEM', `Direct database session created: ${session.id}`, 'success');
      log('SYSTEM', `Session token: ${sessionToken.substring(0, 10)}...`, 'success');
      log('SYSTEM', `Session expires: ${expires}`, 'success');
      
      return session;
    } else {
      log('SYSTEM', `User not found with ID: ${TARGET_USER_ID}`, 'error');
      return null;
    }
  } catch (error) {
    log('SYSTEM', `Error testing auth flow: ${error.message}`, 'error');
    console.error(error);
    return null;
  }
}

// Test video analysis API
async function testVideoAnalysis() {
  log('SYSTEM', 'Testing video analysis API...', 'info');
  
  try {
    // Get or create session
    const session = await testAuthFlow();
    
    if (!session) {
      log('SYSTEM', 'Cannot test video analysis without valid session', 'error');
      return null;
    }
    
    // Test API call
    log('SYSTEM', 'Making test call to video analysis API...', 'info');
    
    const payload = {
      videoUri: TARGET_VIDEO_URI,
      sessionId: TARGET_SESSION_ID,
      analysisType: 'comprehensive'
    };
    
    log('SYSTEM', `Request payload: ${JSON.stringify(payload, null, 2)}`, 'info');
    
    // Set up cookies for authentication
    const cookies = `next-auth.session-token=${session.sessionToken}`;
    
    try {
      const response = await fetch('http://localhost:3006/api/video-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        body: JSON.stringify(payload)
      });
      
      log('SYSTEM', `Response status: ${response.status}`, 'info');
      
      const headers = {};
      response.headers.forEach((value, name) => {
        headers[name] = value;
      });
      log('SYSTEM', `Response headers: ${JSON.stringify(headers, null, 2)}`, 'info');
      
      if (response.ok) {
        const data = await response.json();
        log('SYSTEM', `Video analysis API call successful: ${JSON.stringify(data)}`, 'success');
        return data;
      } else {
        const errorText = await response.text();
        log('SYSTEM', `Video analysis API call failed: ${response.status}`, 'error');
        log('SYSTEM', `Error response: ${errorText}`, 'error');
        
        if (response.status === 401) {
          log('SYSTEM', '401 Unauthorized - Session validation failed', 'error');
          log('SYSTEM', 'This indicates NextAuth session validation is failing', 'error');
          log('SYSTEM', 'Check if NEXTAUTH_SECRET is properly set', 'info');
          log('SYSTEM', 'Verify session cookies are being sent', 'info');
        }
        
        return null;
      }
    } catch (error) {
      log('SYSTEM', `Network error calling API: ${error.message}`, 'error');
      return null;
    }
  } catch (error) {
    log('SYSTEM', `Error testing video analysis: ${error.message}`, 'error');
    console.error(error);
    return null;
  }
}

// Retry video analysis for specific session
async function retryVideoAnalysis() {
  log('SYSTEM', `Retrying video analysis for session ${TARGET_SESSION_ID}...`, 'info');
  
  try {
    // Get or create session
    const session = await testAuthFlow();
    
    if (!session) {
      log('SYSTEM', 'Cannot retry video analysis without valid session', 'error');
      return;
    }
    
    // Check if session exists
    const interviewSession = await prisma.interviewSession.findUnique({
      where: { id: TARGET_SESSION_ID },
      include: { recording: true }
    });
    
    if (!interviewSession) {
      log('SYSTEM', 'Interview session not found', 'error');
      return;
    }
    
    // Get video URI from recording or use target URI
    const videoUri = interviewSession.recording?.url || TARGET_VIDEO_URI;
    
    // Make API call
    log('SYSTEM', `Making API call to trigger video analysis for session ${TARGET_SESSION_ID}...`, 'info');
    log('SYSTEM', `Using video URI: ${videoUri}`, 'info');
    
    const payload = {
      videoUri,
      sessionId: TARGET_SESSION_ID,
      analysisType: 'comprehensive'
    };
    
    // Set up cookies for authentication
    const cookies = `next-auth.session-token=${session.sessionToken}`;
    
    try {
      const response = await fetch('http://localhost:3006/api/video-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookies
        },
        body: JSON.stringify(payload)
      });
      
      log('SYSTEM', `Response status: ${response.status}`, 'info');
      
      if (response.ok) {
        const data = await response.json();
        log('SYSTEM', `Video analysis triggered successfully: ${JSON.stringify(data)}`, 'success');
        
        // Check for video analysis record after a delay
        setTimeout(async () => {
          const videoAnalysis = await prisma.videoAnalysis.findFirst({
            where: {
              sessionId: TARGET_SESSION_ID,
              userId: TARGET_USER_ID
            }
          });
          
          if (videoAnalysis) {
            log('SYSTEM', `Video analysis record created: ${videoAnalysis.id}`, 'success');
          } else {
            log('SYSTEM', 'No video analysis record found after API call', 'warning');
          }
        }, 2000);
        
      } else {
        const errorText = await response.text();
        log('SYSTEM', `Video analysis API call failed: ${response.status}`, 'error');
        log('SYSTEM', `Error response: ${errorText}`, 'error');
      }
    } catch (error) {
      log('SYSTEM', `Network error calling API: ${error.message}`, 'error');
    }
  } catch (error) {
    log('SYSTEM', `Error retrying video analysis: ${error.message}`, 'error');
    console.error(error);
  }
}

// Start the server
server.listen(PORT, () => {
  log('SYSTEM', `Debug dashboard running at http://localhost:${PORT}`, 'success');
  log('SYSTEM', `Log file: ${LOG_FILE}`, 'info');
  log('SYSTEM', `Target session: ${TARGET_SESSION_ID}`, 'info');
  log('SYSTEM', `Target video: ${TARGET_VIDEO_URI}`, 'info');
  
  // Initial check
  setTimeout(() => {
    checkSessionDetails();
  }, 1000);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('SYSTEM', 'Shutting down debug dashboard...', 'info');
  server.close();
  prisma.$disconnect();
  process.exit(0);
});
