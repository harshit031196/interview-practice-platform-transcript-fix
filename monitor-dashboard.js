const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Create Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'combined-monitoring.log');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

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
  log('SYSTEM', 'New client connected to monitoring dashboard', 'success');
  
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
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.action === 'test-auth') {
        log('SYSTEM', 'Testing authentication flow...', 'info');
        testAuthFlow();
      } else if (data.action === 'test-video') {
        log('SYSTEM', 'Testing video analysis API...', 'info');
        testVideoAnalysis();
      } else if (data.action === 'clear-logs') {
        fs.writeFileSync(LOG_FILE, '');
        log('SYSTEM', 'Logs cleared', 'info');
      }
    } catch (error) {
      console.error('Error handling message:', error);
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
  <title>Interview Platform Monitoring Dashboard</title>
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
    .panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .panel {
      background-color: white;
      border-radius: 5px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .panel-header {
      background-color: #7b1fa2;
      color: white;
      padding: 10px 15px;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .panel-body {
      padding: 15px;
      max-height: 300px;
      overflow-y: auto;
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
    .status-warning { background-color: #ff9800; }
    
    .filter-controls {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .filter-btn {
      background-color: #424242;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 15px;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .filter-btn.active {
      background-color: #7b1fa2;
    }
    
    @media (max-width: 768px) {
      .panels {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Interview Platform Monitoring Dashboard</h1>
      <div class="status">
        <div class="status-indicator status-active" id="connection-status"></div>
        <span id="connection-text">Connected</span>
      </div>
    </header>
    
    <div class="controls">
      <button id="test-auth-btn">Test Auth Flow</button>
      <button id="test-video-btn">Test Video Analysis</button>
      <button id="clear-logs-btn" class="clear-btn">Clear Logs</button>
    </div>
    
    <div class="filter-controls">
      <button class="filter-btn active" data-source="all">All</button>
      <button class="filter-btn" data-source="NEXTAUTH">NextAuth</button>
      <button class="filter-btn" data-source="VIDEO">Video Analysis</button>
      <button class="filter-btn" data-source="DB">Database</button>
      <button class="filter-btn" data-source="SYSTEM">System</button>
      <button class="filter-btn" data-type="error">Errors</button>
    </div>
    
    <div class="logs" id="logs"></div>
  </div>
  
  <script>
    // Connect to WebSocket
    const ws = new WebSocket('ws://' + window.location.host + '/ws');
    const logsContainer = document.getElementById('logs');
    const connectionStatus = document.getElementById('connection-status');
    const connectionText = document.getElementById('connection-text');
    let activeFilters = { source: 'all', type: null };
    
    // WebSocket event handlers
    ws.onopen = () => {
      connectionStatus.className = 'status-indicator status-active';
      connectionText.textContent = 'Connected';
      addSystemLog('Connected to monitoring server', 'success');
    };
    
    ws.onclose = () => {
      connectionStatus.className = 'status-indicator status-inactive';
      connectionText.textContent = 'Disconnected';
      addSystemLog('Disconnected from monitoring server', 'error');
      
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };
    
    ws.onerror = (error) => {
      connectionStatus.className = 'status-indicator status-warning';
      connectionText.textContent = 'Error';
      addSystemLog('WebSocket error: ' + error.message, 'error');
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
      // Apply filters
      if (activeFilters.source !== 'all' && log.source !== activeFilters.source) {
        return;
      }
      
      if (activeFilters.type && log.type !== activeFilters.type) {
        return;
      }
      
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.dataset.source = log.source;
      logEntry.dataset.type = log.type;
      
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
    document.getElementById('test-auth-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'test-auth' }));
      addSystemLog('Testing authentication flow...', 'info');
    });
    
    document.getElementById('test-video-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ action: 'test-video' }));
      addSystemLog('Testing video analysis API...', 'info');
    });
    
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
      logsContainer.innerHTML = '';
      ws.send(JSON.stringify({ action: 'clear-logs' }));
      addSystemLog('Logs cleared', 'info');
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(button => {
      button.addEventListener('click', () => {
        if (button.dataset.source) {
          document.querySelectorAll('.filter-btn[data-source]').forEach(btn => {
            btn.classList.remove('active');
          });
          button.classList.add('active');
          activeFilters.source = button.dataset.source;
        } else if (button.dataset.type) {
          if (button.classList.contains('active')) {
            button.classList.remove('active');
            activeFilters.type = null;
          } else {
            document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
              btn.classList.remove('active');
            });
            button.classList.add('active');
            activeFilters.type = button.dataset.type;
          }
        }
        
        // Apply filters to existing logs
        document.querySelectorAll('.log-entry').forEach(entry => {
          const sourceMatch = activeFilters.source === 'all' || entry.dataset.source === activeFilters.source;
          const typeMatch = !activeFilters.type || entry.dataset.type === activeFilters.type;
          
          entry.style.display = sourceMatch && typeMatch ? 'block' : 'none';
        });
      });
    });
  </script>
</body>
</html>
  `);
});

// Start monitoring processes
function startNextAuthMonitoring() {
  log('NEXTAUTH', 'Starting NextAuth monitoring...', 'info');
  
  // Set environment variables for NextAuth debugging
  const env = {
    ...process.env,
    NEXTAUTH_DEBUG: '1',
    DEBUG: 'next-auth:*'
  };
  
  const nextProcess = spawn('npm', ['run', 'dev'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  });
  
  nextProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('next-auth')) {
      log('NEXTAUTH', output, 'info');
    } else if (output.includes('error') || output.includes('Error')) {
      log('NEXTAUTH', output, 'error');
    } else {
      log('SYSTEM', output, 'info');
    }
  });
  
  nextProcess.stderr.on('data', (data) => {
    log('NEXTAUTH', data.toString(), 'error');
  });
  
  return nextProcess;
}

// Monitor database sessions
function monitorDatabaseSessions() {
  log('DB', 'Starting database session monitoring...', 'info');
  
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Check for active sessions every 5 seconds
    setInterval(async () => {
      try {
        const sessions = await prisma.session.findMany({
          where: {
            expires: {
              gt: new Date()
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5,
          include: {
            user: true
          }
        });
        
        if (sessions.length > 0) {
          log('DB', `Found ${sessions.length} active sessions`, 'info');
          
          sessions.forEach(session => {
            const expiresIn = new Date(session.expires) - new Date();
            const expiresInHours = Math.round(expiresIn / (1000 * 60 * 60) * 10) / 10;
            
            log('DB', `Session ${session.id.substring(0, 8)}... for user ${session.user?.email || 'unknown'}, expires in ${expiresInHours}h`, 'info');
          });
        }
      } catch (error) {
        log('DB', `Error checking sessions: ${error.message}`, 'error');
      }
    }, 5000);
    
    return prisma;
  } catch (error) {
    log('DB', `Failed to initialize Prisma: ${error.message}`, 'error');
    return null;
  }
}

// Monitor video analysis API
function monitorVideoAnalysisAPI() {
  log('VIDEO', 'Starting video analysis API monitoring...', 'info');
  
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Check for video analyses every 5 seconds
    setInterval(async () => {
      try {
        const analyses = await prisma.videoAnalysis.findMany({
          orderBy: {
            createdAt: 'desc'
          },
          take: 5
        });
        
        if (analyses.length > 0) {
          log('VIDEO', `Found ${analyses.length} recent video analyses`, 'info');
          
          analyses.forEach(analysis => {
            log('VIDEO', `Analysis ${analysis.id.substring(0, 8)}... for session ${analysis.sessionId}, status: ${analysis.status}`, 'info');
          });
        }
      } catch (error) {
        log('VIDEO', `Error checking video analyses: ${error.message}`, 'error');
      }
    }, 5000);
    
    return prisma;
  } catch (error) {
    log('VIDEO', `Failed to initialize Prisma for video analysis: ${error.message}`, 'error');
    return null;
  }
}

// Test authentication flow
async function testAuthFlow() {
  log('SYSTEM', 'Testing authentication flow...', 'info');
  
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const crypto = require('crypto');
    
    // Check if test user exists
    const testUser = await prisma.user.findUnique({
      where: {
        email: 'pm.candidate@example.com'
      }
    });
    
    if (testUser) {
      log('SYSTEM', `Found test user: ${testUser.email} (${testUser.id})`, 'success');
      
      // Create direct database session
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
      log('SYSTEM', 'Test user not found', 'error');
      return null;
    }
  } catch (error) {
    log('SYSTEM', `Error testing auth flow: ${error.message}`, 'error');
    return null;
  }
}

// Test video analysis API
async function testVideoAnalysis() {
  log('SYSTEM', 'Testing video analysis API...', 'info');
  
  try {
    const session = await testAuthFlow();
    
    if (!session) {
      log('SYSTEM', 'Cannot test video analysis without valid session', 'error');
      return null;
    }
    
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Create test interview session
    log('SYSTEM', 'Creating test interview session...', 'info');
    
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
    
    log('SYSTEM', `Test interview session created: ${interviewSession.id}`, 'success');
    
    // Test video URI
    const videoUri = `gs://wingman-interview-videos-harshit-2024/interviews/${session.userId}/${interviewSession.id}/test-video.webm`;
    
    // Update interview session with video URI
    await prisma.interviewSession.update({
      where: { id: interviewSession.id },
      data: { videoUri }
    });
    
    log('SYSTEM', `Interview session updated with video URI: ${videoUri}`, 'success');
    
    // Create video analysis record
    log('SYSTEM', 'Creating video analysis record...', 'info');
    
    const videoAnalysis = await prisma.videoAnalysis.create({
      data: {
        sessionId: interviewSession.id,
        videoUri,
        status: 'PENDING',
        analysisType: 'comprehensive'
      }
    });
    
    log('SYSTEM', `Video analysis record created: ${videoAnalysis.id}`, 'success');
    log('SYSTEM', 'Video analysis test completed successfully', 'success');
    
    return videoAnalysis;
  } catch (error) {
    log('SYSTEM', `Error testing video analysis API: ${error.message}`, 'error');
    return null;
  }
}

// Start the server
const PORT = 3456;
server.listen(PORT, () => {
  log('SYSTEM', `Monitoring dashboard running at http://localhost:${PORT}`, 'success');
  log('SYSTEM', `Log file: ${LOG_FILE}`, 'info');
  
  // Start monitoring processes
  startNextAuthMonitoring();
  
  // Start other monitoring processes after a delay
  setTimeout(() => {
    monitorDatabaseSessions();
    monitorVideoAnalysisAPI();
  }, 5000);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('SYSTEM', 'Shutting down monitoring dashboard...', 'info');
  server.close();
  process.exit(0);
});
