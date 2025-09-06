require('dotenv').config({ path: '.env.local' });
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const LOG_FILE = path.join(__dirname, 'logs', 'auth-monitoring.log');
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear previous log file
fs.writeFileSync(LOG_FILE, '');

// Log function with color coding
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

// Start NextAuth server with debug mode
function startNextAuthServer() {
  log('Starting NextAuth server with debug mode...', 'AUTH');
  
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
      log(output, 'AUTH');
    } else if (output.includes('error') || output.includes('Error') || output.includes('ERROR')) {
      log(output, 'ERROR');
    } else {
      log(output, 'INFO');
    }
  });
  
  nextProcess.stderr.on('data', (data) => {
    log(data.toString(), 'ERROR');
  });
  
  return nextProcess;
}

// Monitor video analysis API calls
function monitorVideoAnalysisAPI() {
  log('Starting video analysis API monitoring...', 'VIDEO');
  
  // Use curl to monitor API calls
  const curlProcess = spawn('curl', [
    '-N',
    '-s',
    'http://localhost:3000/api/video-analysis',
    '-H', 'Content-Type: application/json',
    '-X', 'OPTIONS'
  ]);
  
  curlProcess.stdout.on('data', (data) => {
    log(data.toString(), 'VIDEO');
  });
  
  curlProcess.stderr.on('data', (data) => {
    log(data.toString(), 'ERROR');
  });
  
  // Also monitor network requests using tcpdump if available
  try {
    const tcpdumpProcess = spawn('tcpdump', [
      '-i', 'lo0',
      '-n',
      'port 3000',
      '-A'
    ]);
    
    tcpdumpProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('video-analysis') || output.includes('auth')) {
        log(output, 'VIDEO');
      }
    });
  } catch (error) {
    log('tcpdump not available, skipping network monitoring', 'INFO');
  }
}

// Monitor browser console logs
function monitorBrowserLogs() {
  log('Setting up browser console log monitoring...', 'INFO');
  
  // Create a simple HTML file that will capture and forward console logs
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Interview Platform Console Monitor</title>
  <script>
    // Override console methods to send logs to server
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    function sendLog(type, args) {
      const logData = Array.from(args).map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      fetch('/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: logData })
      }).catch(e => {});
      
      // Also call original console method
      originalConsole[type].apply(console, args);
    }
    
    console.log = function() { sendLog('log', arguments); };
    console.error = function() { sendLog('error', arguments); };
    console.warn = function() { sendLog('warn', arguments); };
    console.info = function() { sendLog('info', arguments); };
    
    // Monitor network requests
    const originalFetch = window.fetch;
    window.fetch = function() {
      const url = arguments[0];
      const options = arguments[1] || {};
      
      console.log('Fetch request:', url, options.method || 'GET');
      
      return originalFetch.apply(window, arguments)
        .then(response => {
          console.log('Fetch response:', url, response.status);
          return response;
        })
        .catch(error => {
          console.error('Fetch error:', url, error);
          throw error;
        });
    };
    
    // Monitor XHR requests
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      const method = arguments[0];
      const url = arguments[1];
      
      console.log('XHR request:', url, method);
      
      this.addEventListener('load', function() {
        console.log('XHR response:', url, this.status);
      });
      
      this.addEventListener('error', function() {
        console.error('XHR error:', url);
      });
      
      return originalXHROpen.apply(this, arguments);
    };
  </script>
</head>
<body>
  <h1>Interview Platform Console Monitor</h1>
  <p>This page is monitoring console logs from the interview platform.</p>
  <p>Open the interview platform in another tab to see logs here.</p>
  <div id="logs"></div>
</body>
</html>
  `;
  
  fs.writeFileSync(path.join(__dirname, 'console-monitor.html'), htmlContent);
  log('Created console monitor HTML file', 'SUCCESS');
}

// Main function
async function main() {
  log('Starting interview platform monitoring', 'INFO');
  log(`Log file: ${LOG_FILE}`, 'INFO');
  
  // Start NextAuth server with debug mode
  const nextAuthProcess = startNextAuthServer();
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Start video analysis API monitoring
  monitorVideoAnalysisAPI();
  
  // Set up browser console log monitoring
  monitorBrowserLogs();
  
  log('All monitoring processes started', 'SUCCESS');
  log('Press Ctrl+C to stop monitoring', 'INFO');
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('Shutting down monitoring...', 'INFO');
    if (nextAuthProcess && !nextAuthProcess.killed) {
      nextAuthProcess.kill();
    }
    process.exit(0);
  });
}

// Run the main function
main().catch(error => {
  log(`Error in main function: ${error.message}`, 'ERROR');
  process.exit(1);
});
