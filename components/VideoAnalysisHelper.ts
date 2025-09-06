import { getSession } from 'next-auth/react';
import React from 'react';

// Define a type that can handle both direct callbacks and React setState
type ProgressCallback = ((message: string) => void) | React.Dispatch<React.SetStateAction<string>>;

/**
 * Helper function to check if the current session is valid
 * Tries JWT session first, then falls back to database session
 * If no valid session exists, creates a direct database session
 */
export const ensureValidSession = async (): Promise<boolean> => {
  try {
    console.log('Ensuring valid session...');
    // First try to get JWT session
    const session = await getSession();
    
    if (session?.user?.id) {
      console.log('Valid JWT session found');
      return true;
    }
    
    // Try to refresh the session
    console.log('No valid JWT session, attempting to refresh...');
    await fetch('/api/auth/session', { 
      method: 'GET', 
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    const refreshedSession = await getSession();
    if (refreshedSession?.user?.id) {
      console.log('Session refreshed successfully');
      return true;
    }
    
    // Check for database session directly
    console.log('Checking for database session...');
    try {
      const dbSessionResponse = await fetch('/api/auth/user', {
        method: 'GET',
        credentials: 'include',
        headers: { 
          'X-Auth-Method': 'hybrid-session',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (dbSessionResponse.ok) {
        const userData = await dbSessionResponse.json();
        console.log('Valid database session found:', userData?.id ? 'User ID present' : 'No user ID');
        return !!userData?.id;
      }
      
      console.log('No valid database session found, attempting to create direct session...');
      
      // Last resort: create a direct database session
      const createSessionResponse = await fetch('/api/auth/create-direct-session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (createSessionResponse.ok) {
        console.log('Direct database session created successfully');
        // Verify the session was created by checking user data
        const verifySessionResponse = await fetch('/api/auth/user', {
          method: 'GET',
          credentials: 'include',
          headers: { 
            'X-Auth-Method': 'hybrid-session',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (verifySessionResponse.ok) {
          const userData = await verifySessionResponse.json();
          console.log('Direct session verification:', userData?.id ? 'User ID present' : 'No user ID');
          return !!userData?.id;
        }
      }
      
      console.log('Failed to create direct database session');
      return false;
    } catch (dbError) {
      console.error('Error with database session operations:', dbError);
      return false;
    }
  } catch (error) {
    console.error('Session validation error:', error);
    return false;
  }
};

/**
 * Updates the interview session with the videoUri in the database
 */
export const updateSessionVideoUri = async (sessionId: string, videoUri: string): Promise<boolean> => {
  try {
    console.log('Updating interview session with videoUri:', videoUri);
    const response = await fetch('/api/interviews/update-video-uri', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sessionId, videoUri })
    });
    
    if (!response.ok) {
      console.error('Failed to update session with videoUri:', response.status);
      return false;
    }
    
    console.log('Successfully updated interview session with videoUri');
    return true;
  } catch (error) {
    console.error('Error updating session with videoUri:', error);
    return false;
  }
};

/**
 * Triggers video analysis with retry logic and proper authentication
 * Ensures valid session before making API calls
 */
export const triggerVideoAnalysisWithRetry = async (
  videoUri: string,
  sessionId: string,
  maxRetries: number = 3,
  progressCallback?: ProgressCallback,
  segmentIndex?: number
): Promise<any> => {
  console.log('🔍 VIDEO ANALYSIS TRIGGER - Starting with params:', { videoUri, sessionId, maxRetries });
  let attempt = 1;
  let useApiKey = false;
  const API_SECRET_KEY = process.env.NEXT_PUBLIC_API_SECRET_KEY || '';
  
  // First try with session authentication
  console.log('🔍 VIDEO ANALYSIS TRIGGER - Validating session...');
  let isSessionValid = await ensureValidSession();
  console.log('🔍 VIDEO ANALYSIS TRIGGER - Session validation result:', isSessionValid);
  
  // If session validation fails and we have an API key, use that instead
  if (!isSessionValid && API_SECRET_KEY) {
    console.log('🔍 VIDEO ANALYSIS TRIGGER - Session validation failed, falling back to API key authentication');
    useApiKey = true;
    if (progressCallback) {
      progressCallback('Using API key authentication as fallback...');
    }
  } else if (!isSessionValid) {
    console.error('🔍 VIDEO ANALYSIS TRIGGER - Failed to establish valid session before video analysis and no API key available');
    if (progressCallback) {
      progressCallback('Session validation failed. Your video has been saved. Please refresh the page to continue.');
    }
    throw new Error('No valid authentication method available for video analysis');
  }
  
  // Update the interview session with videoUri
  console.log('🔍 VIDEO ANALYSIS TRIGGER - Updating session with videoUri...');
  const updateResult = await updateSessionVideoUri(sessionId, videoUri);
  console.log('🔍 VIDEO ANALYSIS TRIGGER - Session update result:', updateResult);
  
  while (attempt <= maxRetries) {
    try {
      console.log(`🔍 VIDEO ANALYSIS TRIGGER - Attempt ${attempt} of ${maxRetries}`);
      
      // Prepare headers based on authentication method
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      };
      
      // Add appropriate authentication headers
      if (useApiKey && API_SECRET_KEY) {
        headers['Authorization'] = `Bearer ${API_SECRET_KEY}`;
        console.log('🔍 VIDEO ANALYSIS TRIGGER - Using API key authentication');
      } else {
        headers['X-Auth-Method'] = 'hybrid-session';
        console.log('🔍 VIDEO ANALYSIS TRIGGER - Using session authentication');
      }
      
      const requestBody: { [key: string]: any } = {
        videoUri,
        sessionId,
        analysisType: 'comprehensive',
        retryAttempt: attempt,
      };

      if (segmentIndex !== undefined) {
        requestBody.segmentIndex = segmentIndex;
      }
      
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - Making API request', 'background: #0000FF; color: white; padding: 2px 5px; border-radius: 3px;', {
        url: '/api/video-analysis',
        method: 'POST',
        headers: Object.keys(headers),
        authMethod: useApiKey ? 'API_KEY' : 'SESSION',
        credentials: useApiKey ? 'omit' : 'include',
        body: JSON.stringify(requestBody)
      });
      
      // Log the exact moment before the fetch call
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - FETCH CALL STARTING NOW', 'background: #FF00FF; color: white; padding: 2px 5px; border-radius: 3px;', new Date().toISOString());
      
      const response = await fetch('/api/video-analysis', {
        method: 'POST',
        headers,
        credentials: useApiKey ? 'omit' : 'include', // Only include cookies for session auth
        body: JSON.stringify(requestBody)
      });
      
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - FETCH CALL COMPLETED', 'background: #FF00FF; color: white; padding: 2px 5px; border-radius: 3px;', new Date().toISOString());
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - Response status:', 'background: #00AA00; color: white; padding: 2px 5px; border-radius: 3px;', response.status, response.statusText);
      
      // Log response headers
      const responseHeaders: { [key: string]: string } = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      console.log('🔍 VIDEO ANALYSIS TRIGGER - Response headers:', responseHeaders);
      
      if (!response.ok) {
        if (response.status === 401) {
          console.error('🔍 VIDEO ANALYSIS TRIGGER - Authentication failed (401)');
          // Try to refresh session before giving up
          console.log('🔍 VIDEO ANALYSIS TRIGGER - Attempting to refresh session...');
          const refreshResult = await ensureValidSession();
          console.log('🔍 VIDEO ANALYSIS TRIGGER - Session refresh result:', refreshResult);
          if (!refreshResult) {
            console.error('🔍 VIDEO ANALYSIS TRIGGER - Session refresh failed');
            throw new Error('AUTHENTICATION_EXPIRED');
          }
          throw new Error('Authentication needs refresh');
        }
        const errorText = await response.text();
        console.error('🔍 VIDEO ANALYSIS TRIGGER - API error details:', errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      // Clone the response to read it twice
      const responseClone = response.clone();
      
      // Get the raw response text first for logging
      const rawResponseText = await responseClone.text();
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - Raw response:', 'background: #00AA00; color: white; padding: 2px 5px; border-radius: 3px;', rawResponseText.substring(0, 500) + (rawResponseText.length > 500 ? '...' : ''));
      
      // Parse as JSON if possible
      let responseData: Record<string, any>;
      try {
        responseData = JSON.parse(rawResponseText);
        console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - Success! Response data:', 'background: #00AA00; color: white; padding: 2px 5px; border-radius: 3px;', responseData);
      } catch (parseError) {
        console.error('%c 🔍 VIDEO ANALYSIS TRIGGER - Failed to parse response as JSON:', 'background: #FF0000; color: white; padding: 2px 5px; border-radius: 3px;', parseError);
        responseData = { rawResponse: rawResponseText, parseError: true };
      }
      
      // Log success event for monitoring
      console.log('%c 🔍 VIDEO ANALYSIS TRIGGER - API CALL SUCCESSFUL', 'background: #00AA00; color: white; font-size: 14px; padding: 2px 5px; border-radius: 3px;');
      
      return responseData;
    } catch (error: any) {
      // Log detailed error information with high visibility
      console.error('%c 🔍 VIDEO ANALYSIS TRIGGER - FETCH ERROR OCCURRED', 'background: #FF0000; color: white; font-size: 14px; padding: 2px 5px; border-radius: 3px;', new Date().toISOString());
      
      // Log error details
      const errorDetails = {
        name: error?.name || 'Unknown',
        message: error?.message || 'No message',
        stack: error?.stack || 'No stack trace',
        type: error?.constructor?.name || typeof error,
        attempt: attempt,
        timestamp: new Date().toISOString()
      };
      
      console.error('%c 🔍 VIDEO ANALYSIS TRIGGER - Error details:', 'background: #FF0000; color: white; padding: 2px 5px; border-radius: 3px;', errorDetails);
      
      if (error.message === 'AUTHENTICATION_EXPIRED') {
        console.error('%c 🔍 VIDEO ANALYSIS TRIGGER - Authentication expired', 'background: #FF0000; color: white; padding: 2px 5px; border-radius: 3px;');
        if (progressCallback) {
          progressCallback('Authentication failed. Your video has been saved. Please refresh the page to continue.');
        }
        throw new Error('Authentication failed during analysis...');
      }
      
      // Network error specific logging
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error('%c 🔍 VIDEO ANALYSIS TRIGGER - NETWORK ERROR', 'background: #FF0000; color: white; font-size: 14px; padding: 2px 5px; border-radius: 3px;', 'This may indicate a CORS issue, network connectivity problem, or server unavailability');
      }
      
      console.error(`%c 🔍 VIDEO ANALYSIS TRIGGER - Attempt ${attempt} failed:`, 'background: #FF0000; color: white; padding: 2px 5px; border-radius: 3px;', error);
      if (attempt === maxRetries) {
        console.error('🔍 VIDEO ANALYSIS TRIGGER - All retry attempts failed');
        if (progressCallback) {
          progressCallback('Video analysis failed. Your video has been saved. Please try again later.');
        }
        throw error;
      }
      // Wait before retrying
      console.log(`🔍 VIDEO ANALYSIS TRIGGER - Waiting 5 seconds before retry ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    attempt++;
  }
  
  console.error('🔍 VIDEO ANALYSIS TRIGGER - Failed after all retry attempts');
  throw new Error('Video analysis failed after all retry attempts');
};
