const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const LOG_FILE = path.join(__dirname, 'logs', 'interview-platform.log');
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Helper to format log entries
function formatLog(source, data) {
  const timestamp = new Date().toISOString();
  const logData = data.toString().trim();
  if (!logData) return null;
  return `[${timestamp}] [${source}] ${logData}\n`;
}

// Write to log file and console
function writeToLog(source, data) {
  const formattedLog = formatLog(source, data);
  if (!formattedLog) return;
  
  fs.appendFileSync(LOG_FILE, formattedLog);
  
  // Color coding for console
  let colorCode;
  switch(source) {
    case 'NEXTAUTH-ERROR':
    case 'DB-ERROR':
    case 'VIDEO-ERROR':
      colorCode = '\x1b[31m'; // Red for errors
      break;
    case 'NEXTAUTH':
      colorCode = '\x1b[36m'; // Cyan for auth
      break;
    case 'VIDEO-API':
      colorCode = '\x1b[35m'; // Magenta for video
      break;
    case 'DB-SESSION':
      colorCode = '\x1b[33m'; // Yellow for database
      break;
    default:
      colorCode = '\x1b[0m'; // Default
  }
  
  console.log(`${colorCode}${formattedLog.trim()}\x1b[0m`);
}

// Monitor NextAuth debug logs
function monitorNextAuthServer() {
  console.log('Starting NextAuth server with debug mode...');
  
  // Set environment variables for NextAuth debugging
  const env = {
    ...process.env,
    NEXTAUTH_DEBUG: '1',
    DEBUG: 'next-auth:*',
    NODE_OPTIONS: '--inspect'
  };
  
  const nextProcess = spawn('npm', ['run', 'dev'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    env
  });
  
  nextProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('next-auth') || output.includes('auth') || output.includes('session')) {
      writeToLog('NEXTAUTH', data);
    } else {
      writeToLog('NEXT', data);
    }
  });
  
  nextProcess.stderr.on('data', (data) => {
    writeToLog('NEXTAUTH-ERROR', data);
  });
  
  return nextProcess;
}

// Monitor database session activity
function monitorDatabaseSessions() {
  console.log('Starting database session monitoring...');
  
  // Run a script that watches for session changes
  const dbWatchProcess = spawn('node', ['debug-auth-sessions.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  
  dbWatchProcess.stdout.on('data', (data) => {
    writeToLog('DB-SESSION', data);
  });
  
  dbWatchProcess.stderr.on('data', (data) => {
    writeToLog('DB-ERROR', data);
  });
  
  return dbWatchProcess;
}

// Monitor UnifiedInterviewSession component
function monitorUnifiedInterviewSession() {
  console.log('Starting UnifiedInterviewSession component monitoring...');
  
  // Add browser console log monitoring
  const browserLogsProcess = spawn('node', ['debug-auth-flow.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  
  browserLogsProcess.stdout.on('data', (data) => {
    writeToLog('INTERVIEW-SESSION', data);
  });
  
  browserLogsProcess.stderr.on('data', (data) => {
    writeToLog('INTERVIEW-SESSION-ERROR', data);
  });
  
  return browserLogsProcess;
}

// Monitor video analysis API
function monitorVideoAnalysisAPI() {
  console.log('Starting video analysis API monitoring...');
  
  const videoProcess = spawn('node', ['debug-analysis-storage.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  
  videoProcess.stdout.on('data', (data) => {
    writeToLog('VIDEO-API', data);
  });
  
  videoProcess.stderr.on('data', (data) => {
    writeToLog('VIDEO-ERROR', data);
  });
  
  return videoProcess;
}

// Start all monitoring processes
console.log(`Starting interview platform monitoring. Log file: ${LOG_FILE}`);
console.log('Press Ctrl+C to stop monitoring');

const processes = [];

// Start NextAuth server with debug mode
processes.push(monitorNextAuthServer());

// Start other monitoring processes after a delay to avoid port conflicts
setTimeout(() => {
  processes.push(monitorDatabaseSessions());
  processes.push(monitorUnifiedInterviewSession());
  processes.push(monitorVideoAnalysisAPI());
}, 5000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Stopping all monitoring processes...');
  processes.forEach(proc => {
    if (proc && !proc.killed) {
      proc.kill();
    }
  });
  process.exit(0);
});
