const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const LOG_FILE = path.join(__dirname, 'logs', 'combined.log');
const NEXT_PORT = 3000;

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Helper to format log entries
function formatLog(source, data) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${source}] ${data.toString().trim()}\n`;
}

// Write to combined log file
function writeToLog(source, data) {
  const formattedLog = formatLog(source, data);
  fs.appendFileSync(LOG_FILE, formattedLog);
  console.log(formattedLog.trim());
}

// Monitor Next.js server logs (port 3000)
function monitorNextServer() {
  console.log('Starting Next.js server monitoring...');
  
  const nextProcess = spawn('npm', ['run', 'dev'], { 
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: NEXT_PORT }
  });
  
  nextProcess.stdout.on('data', (data) => {
    writeToLog('NEXT', data);
  });
  
  nextProcess.stderr.on('data', (data) => {
    writeToLog('NEXT-ERROR', data);
  });
  
  nextProcess.on('close', (code) => {
    writeToLog('NEXT', `Server process exited with code ${code}`);
  });
  
  return nextProcess;
}

// Monitor Google Cloud logs
function monitorCloudLogs() {
  console.log('Starting Google Cloud logs monitoring...');
  
  // Get project ID from environment or config
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'wingman-interview-470419';
  
  const cloudLogsProcess = spawn('gcloud', [
    'logging', 
    'read', 
    `resource.type=cloud_function AND resource.labels.project_id=${projectId}`,
    '--format=json',
    '--freshness=1d',
    '--limit=100'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  
  cloudLogsProcess.stdout.on('data', (data) => {
    try {
      const logs = JSON.parse(data.toString());
      logs.forEach(log => {
        const message = log.textPayload || JSON.stringify(log.jsonPayload);
        writeToLog('CLOUD', `${log.severity}: ${message}`);
      });
    } catch (e) {
      writeToLog('CLOUD', data);
    }
  });
  
  cloudLogsProcess.stderr.on('data', (data) => {
    writeToLog('CLOUD-ERROR', data);
  });
  
  return cloudLogsProcess;
}

// Monitor database session creation
function monitorDatabaseSessions() {
  console.log('Starting database session monitoring...');
  
  const dbMonitorProcess = spawn('node', ['--inspect', 'debug-auth-sessions.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  dbMonitorProcess.stdout.on('data', (data) => {
    writeToLog('DB-SESSION', data);
  });
  
  dbMonitorProcess.stderr.on('data', (data) => {
    writeToLog('DB-SESSION-ERROR', data);
  });
  
  return dbMonitorProcess;
}

// Monitor video analysis API calls
function monitorVideoAnalysis() {
  console.log('Starting video analysis API monitoring...');
  
  const videoAnalysisProcess = spawn('node', ['test-video-analysis-flow.js'], { 
    stdio: ['ignore', 'pipe', 'pipe'] 
  });
  
  videoAnalysisProcess.stdout.on('data', (data) => {
    writeToLog('VIDEO-ANALYSIS', data);
  });
  
  videoAnalysisProcess.stderr.on('data', (data) => {
    writeToLog('VIDEO-ANALYSIS-ERROR', data);
  });
  
  return videoAnalysisProcess;
}

// Start all monitoring processes
console.log(`Starting combined log monitoring. Log file: ${LOG_FILE}`);
console.log('Press Ctrl+C to stop monitoring');

const processes = [
  monitorNextServer(),
  monitorDatabaseSessions()
];

// Start cloud monitoring if gcloud is available
try {
  const gcloudCheck = spawn('which', ['gcloud']);
  gcloudCheck.on('close', (code) => {
    if (code === 0) {
      processes.push(monitorCloudLogs());
    } else {
      console.log('gcloud not found. Cloud logs monitoring disabled.');
    }
  });
} catch (e) {
  console.log('Could not check for gcloud. Cloud logs monitoring disabled.');
}

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
