const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');

// Configuration
const LOG_FILES = [
  './logs/auth-video.log',
  './logs/auth-video-debug.log',
  './logs/combined-monitoring.log'
];

// ANSI color codes for better visualization
const colors = {
  apiCall: chalk.bgBlue.white,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  auth: chalk.magenta,
  session: chalk.cyan,
  video: chalk.blue,
  retry: chalk.bgYellow.black,
  timestamp: chalk.gray,
  requestId: chalk.bgWhite.black
};

// Patterns to match in logs
const patterns = {
  videoAnalysisApiCall: /VIDEO ANALYSIS API CALLED/i,
  videoAnalysisStart: /Starting video analysis for/i,
  videoAnalysisComplete: /Video analysis completed successfully/i,
  videoAnalysisFailed: /Video analysis (API )?error/i,
  authenticationAttempt: /Checking authentication|Auth method requested/i,
  authenticationSuccess: /Authenticated via/i,
  authenticationFailed: /Authentication failed|Invalid API key|session invalid or expired/i,
  sessionValidation: /Checking database session|Session present|JWT token present/i,
  sessionExpiry: /Session expiry|JWT token expiry/i,
  retryAttempt: /This is retry attempt|Attempting API key fallback/i,
  triggerAttempt: /Attempting to trigger video analysis/i,
  requestId: /\[(va-[a-z0-9-]+)\]/i,
  errorDetails: /Error details|Failed to|error:/i
};

// Track active requests for correlation
const activeRequests = new Map();

// Create a dashboard header
console.log('\n' + chalk.bgWhite.black(' VIDEO ANALYSIS API MONITORING DASHBOARD ') + '\n');
console.log(chalk.yellow('Monitoring logs for video analysis API activity...'));
console.log(chalk.gray('Press Ctrl+C to exit\n'));

// Create legend
console.log(chalk.bold('Legend:'));
console.log(`${colors.apiCall(' API CALL ')} - Video Analysis API called`);
console.log(`${colors.auth(' AUTH ')} - Authentication attempts`);
console.log(`${colors.session(' SESSION ')} - Session validation`);
console.log(`${colors.video(' VIDEO ')} - Video processing`);
console.log(`${colors.retry(' RETRY ')} - Retry attempts`);
console.log(`${colors.success('✓')} - Success`);
console.log(`${colors.error('✗')} - Error`);
console.log(`${colors.warning('!')} - Warning`);
console.log('\n' + chalk.bold('Monitoring started at: ') + new Date().toISOString() + '\n');

// Function to parse and highlight log lines
function processLogLine(line) {
  // Skip empty lines
  if (!line.trim()) return;

  // Extract timestamp if present
  const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  const timestamp = timestampMatch ? timestampMatch[0] : '';
  
  // Extract request ID if present
  const requestIdMatch = line.match(patterns.requestId);
  const requestId = requestIdMatch ? requestIdMatch[1] : '';
  
  // Track request in active requests map
  if (requestId && !activeRequests.has(requestId)) {
    activeRequests.set(requestId, {
      id: requestId,
      firstSeen: new Date(),
      status: 'pending',
      authMethod: null,
      errors: []
    });
  }

  // Format the line based on content
  let formattedLine = line;
  let prefix = '';

  // Add timestamp prefix if available
  if (timestamp) {
    prefix += colors.timestamp(`[${timestamp}] `);
  }
  
  // Add request ID if available
  if (requestId) {
    prefix += colors.requestId(`[${requestId}] `);
  }

  // Determine the type of log message and format accordingly
  if (patterns.videoAnalysisApiCall.test(line)) {
    formattedLine = colors.apiCall(' API CALL ') + ' ' + line;
    if (requestId) {
      activeRequests.get(requestId).status = 'started';
    }
  } 
  else if (patterns.authenticationAttempt.test(line)) {
    formattedLine = colors.auth(' AUTH ') + ' ' + line;
  }
  else if (patterns.authenticationSuccess.test(line)) {
    formattedLine = colors.auth(' AUTH ') + ' ' + colors.success('✓ ') + line;
    if (requestId) {
      const authMethodMatch = line.match(/Authenticated via ([a-z_]+)/i);
      if (authMethodMatch) {
        activeRequests.get(requestId).authMethod = authMethodMatch[1];
        activeRequests.get(requestId).status = 'authenticated';
      }
    }
  }
  else if (patterns.authenticationFailed.test(line)) {
    formattedLine = colors.auth(' AUTH ') + ' ' + colors.error('✗ ') + line;
    if (requestId) {
      activeRequests.get(requestId).status = 'auth_failed';
      activeRequests.get(requestId).errors.push('Authentication failed');
    }
  }
  else if (patterns.sessionValidation.test(line)) {
    formattedLine = colors.session(' SESSION ') + ' ' + line;
  }
  else if (patterns.sessionExpiry.test(line)) {
    formattedLine = colors.session(' SESSION ') + ' ' + colors.warning('! ') + line;
  }
  else if (patterns.videoAnalysisStart.test(line)) {
    formattedLine = colors.video(' VIDEO ') + ' ' + line;
    if (requestId) {
      activeRequests.get(requestId).status = 'processing';
    }
  }
  else if (patterns.videoAnalysisComplete.test(line)) {
    formattedLine = colors.video(' VIDEO ') + ' ' + colors.success('✓ ') + line;
    if (requestId) {
      activeRequests.get(requestId).status = 'completed';
    }
  }
  else if (patterns.videoAnalysisFailed.test(line)) {
    formattedLine = colors.video(' VIDEO ') + ' ' + colors.error('✗ ') + line;
    if (requestId) {
      activeRequests.get(requestId).status = 'failed';
      activeRequests.get(requestId).errors.push('Video analysis failed');
    }
  }
  else if (patterns.retryAttempt.test(line)) {
    formattedLine = colors.retry(' RETRY ') + ' ' + line;
  }
  else if (patterns.triggerAttempt.test(line)) {
    formattedLine = colors.video(' TRIGGER ') + ' ' + line;
  }
  else if (patterns.errorDetails.test(line)) {
    formattedLine = colors.error(' ERROR ') + ' ' + line;
    if (requestId && activeRequests.has(requestId)) {
      activeRequests.get(requestId).errors.push(line.trim());
    }
  }

  // Print the formatted line with prefix
  console.log(prefix + formattedLine);
  
  // Clean up old requests (older than 30 minutes)
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  for (const [id, request] of activeRequests.entries()) {
    if (request.firstSeen < thirtyMinutesAgo) {
      activeRequests.delete(id);
    }
  }
}

// Function to monitor a log file
function monitorLogFile(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(colors.warning(`Warning: Log file not found: ${filePath}`));
      return;
    }
    
    console.log(colors.success(`Monitoring log file: ${filePath}`));
    
    // Get initial file size
    const stats = fs.statSync(filePath);
    let lastSize = stats.size;
    
    // Initial read of the file
    const initialContent = fs.readFileSync(filePath, 'utf8');
    const lines = initialContent.split('\n');
    
    // Process the last 20 lines (or fewer if file is smaller)
    const startLine = Math.max(0, lines.length - 20);
    for (let i = startLine; i < lines.length; i++) {
      processLogLine(lines[i]);
    }
    
    // Watch for changes
    fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
      if (curr.size > lastSize) {
        const stream = fs.createReadStream(filePath, {
          start: lastSize,
          end: curr.size
        });
        
        const rl = readline.createInterface({
          input: stream,
          crlfDelay: Infinity
        });
        
        rl.on('line', (line) => {
          processLogLine(line);
        });
        
        lastSize = curr.size;
      } else if (curr.size < lastSize) {
        // File was truncated, reset
        lastSize = curr.size;
      }
    });
  } catch (error) {
    console.error(colors.error(`Error monitoring ${filePath}: ${error.message}`));
  }
}

// Start monitoring all log files
LOG_FILES.forEach(monitorLogFile);

// Print active requests status every 10 seconds
setInterval(() => {
  if (activeRequests.size > 0) {
    console.log('\n' + chalk.bgWhite.black(' ACTIVE REQUESTS SUMMARY ') + '\n');
    
    for (const [id, request] of activeRequests.entries()) {
      const duration = Math.round((new Date() - request.firstSeen) / 1000);
      let statusColor;
      
      switch (request.status) {
        case 'completed':
          statusColor = colors.success;
          break;
        case 'failed':
          statusColor = colors.error;
          break;
        case 'auth_failed':
          statusColor = colors.error;
          break;
        case 'processing':
          statusColor = colors.video;
          break;
        case 'authenticated':
          statusColor = colors.auth;
          break;
        default:
          statusColor = colors.warning;
      }
      
      console.log(colors.requestId(`[${id}]`) + 
        ` Status: ${statusColor(request.status)} | ` +
        `Auth: ${request.authMethod || 'none'} | ` +
        `Duration: ${duration}s | ` +
        `Errors: ${request.errors.length}`);
      
      if (request.errors.length > 0) {
        console.log(colors.error('  Errors:'));
        request.errors.slice(0, 3).forEach(err => {
          console.log(colors.error(`  - ${err.substring(0, 100)}${err.length > 100 ? '...' : ''}`));
        });
        if (request.errors.length > 3) {
          console.log(colors.error(`  ... and ${request.errors.length - 3} more errors`));
        }
      }
    }
    console.log('');
  }
}, 10000);

// Handle exit
process.on('SIGINT', () => {
  console.log(chalk.yellow('\nMonitoring stopped.'));
  LOG_FILES.forEach(file => fs.unwatchFile(file));
  process.exit(0);
});
