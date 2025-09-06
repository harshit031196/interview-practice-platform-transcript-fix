# API Key Setup for External Scripts

## Overview
External scripts (like `trigger-video-analysis-session.js`) require API key authentication since they run outside the browser context and cannot use session cookies.

## Setup Instructions

### 1. Generate API Secret Key
Generate a secure random string for your API key:
```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 32

# Option 3: Using online generator
# Visit: https://www.random.org/strings/
```

### 2. Add to Environment Variables
Add the generated key to your `.env.local` file:
```env
API_SECRET_KEY="your-generated-secure-api-key-here"
```

### 3. Restart Development Server
After adding the environment variable, restart your Next.js development server:
```bash
npm run dev
```

## Usage in External Scripts

### Authentication Headers
External scripts must include the API key in the `x-api-key` header:
```javascript
const response = await fetch('http://localhost:3000/api/video-analysis', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.API_SECRET_KEY
  },
  body: JSON.stringify({
    videoUri: 'gs://bucket/path/to/video.webm',
    sessionId: 'session-id',
    analysisType: 'comprehensive'
  })
});
```

### Environment Variables in Scripts
Make sure your external scripts load environment variables:
```javascript
require('dotenv').config();
const API_SECRET_KEY = process.env.API_SECRET_KEY;
```

## Security Considerations

1. **Keep API Key Secret**: Never commit the actual API key to version control
2. **Use Different Keys**: Use different API keys for development, staging, and production
3. **Rotate Regularly**: Change API keys periodically for security
4. **Limit Access**: Only use API keys for trusted external scripts

## Troubleshooting

### 401 Unauthorized Error
If you get a 401 error:
1. Check that `API_SECRET_KEY` is set in `.env.local`
2. Verify the key matches between client and server
3. Ensure you're including the `x-api-key` header
4. Restart the development server after adding the environment variable

### Missing Environment Variable
If the script exits with "API_SECRET_KEY environment variable is required":
1. Create or update your `.env.local` file
2. Add the `API_SECRET_KEY` line
3. Make sure the file is in the project root directory

## Supported Endpoints

The following API endpoints support API key authentication:
- `POST /api/video-analysis` - Trigger video analysis
- `GET /api/video-analysis/results/{sessionId}` - Get analysis results
- `POST /api/video-analysis/results/{sessionId}` - Store analysis results

## Example Usage

```javascript
// trigger-video-analysis-session.js
const fetch = require('node-fetch');
require('dotenv').config();

const API_SECRET_KEY = process.env.API_SECRET_KEY;

async function triggerAnalysis() {
  const response = await fetch('http://localhost:3000/api/video-analysis', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_SECRET_KEY
    },
    body: JSON.stringify({
      videoUri: 'gs://bucket/video.webm',
      sessionId: 'session-123',
      analysisType: 'comprehensive'
    })
  });
  
  if (response.ok) {
    const result = await response.json();
    console.log('Analysis completed:', result);
  } else {
    console.error('Analysis failed:', response.status);
  }
}
```
