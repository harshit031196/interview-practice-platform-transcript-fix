const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const LOG_FILE = path.join(__dirname, 'logs', 'auth-video.log');

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Helper to format log entries
function formatLog(source, data) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${source}] ${data.toString().trim()}\n`;
}

// Write to log file and console
function writeToLog(source, data) {
  const formattedLog = formatLog(source, data);
  fs.appendFileSync(LOG_FILE, formattedLog);
  console.log(formattedLog.trim());
}

// Monitor NextAuth debug logs
function monitorNextAuthDebug() {
  console.log('Starting NextAuth debug monitoring...');
  
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
function monitorDatabaseActivity() {
  console.log('Starting database session monitoring...');
  
  // Run a script that watches for session changes
  const dbWatchProcess = spawn('node', ['--inspect', 'debug-auth-sessions.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  dbWatchProcess.stdout.on('data', (data) => {
    writeToLog('DB-SESSION', data);
  });
  
  dbWatchProcess.stderr.on('data', (data) => {
    writeToLog('DB-SESSION-ERROR', data);
  });
  
  return dbWatchProcess;
}

// Monitor video analysis API calls
function monitorVideoAnalysisAPI() {
  console.log('Starting video analysis API monitoring...');
  
  // Run the test script in watch mode
  const videoAnalysisProcess = spawn('node', ['test-jwt-video-analysis.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  videoAnalysisProcess.stdout.on('data', (data) => {
    writeToLog('VIDEO-API', data);
  });
  
  videoAnalysisProcess.stderr.on('data', (data) => {
    writeToLog('VIDEO-API-ERROR', data);
  });
  
  return videoAnalysisProcess;
}

// Monitor UnifiedInterviewSession component
function monitorUnifiedInterviewSession() {
  console.log('Starting UnifiedInterviewSession component monitoring...');
  
  // Add browser console log monitoring
  const browserLogsProcess = spawn('node', ['--inspect', 'debug-auth-flow.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  browserLogsProcess.stdout.on('data', (data) => {
    writeToLog('INTERVIEW-SESSION', data);
  });
  
  browserLogsProcess.stderr.on('data', (data) => {
    writeToLog('INTERVIEW-SESSION-ERROR', data);
  });
  
  return browserLogsProcess;
}

// Start all monitoring processes
console.log(`Starting authentication and video analysis monitoring. Log file: ${LOG_FILE}`);
console.log('Press Ctrl+C to stop monitoring');

const processes = [
  monitorNextAuthDebug(),
  monitorDatabaseActivity(),
  monitorVideoAnalysisAPI(),
  monitorUnifiedInterviewSession()
];

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
