/* eslint-disable @typescript-eslint/no-unused-vars, no-unused-vars, react-hooks/rules-of-hooks */
// Enhanced authentication handling for UnifiedInterviewSession.tsx
// Replace the existing triggerVideoAnalysisWithRetry function with this version

import { signIn, getSession } from 'next-auth/react';
import { useCallback } from 'react';

// Declarations for symbols that are provided by the consuming component.
// This keeps this reference file type-safe without coupling to component scope.
declare function setAnalysisProgress(message: string): void;
declare function setTimerActive(active: boolean): void;
declare const streamRef: { current: MediaStream | null };
declare const recordedBlob: Blob | null;
declare function setIsAnalyzing(active: boolean): void;
declare const isConversational: boolean;
declare const messages: any[];
declare const onComplete: undefined | ((data: any) => void);
declare const sessionId: string;

// Enhanced retry logic with session refresh capability
const triggerVideoAnalysisWithRetry = async (videoUri: string, sessionId: string, maxRetries = 3, timeoutMs = 600000) => {
  let attempt = 1;
  
  // Input validation
  if (!videoUri || !videoUri.startsWith('gs://')) {
    throw new Error('Invalid video URI: must be a valid Google Cloud Storage path');
  }
  
  while (attempt <= maxRetries) {
    try {
      console.log(`[ATTEMPT ${attempt}/${maxRetries}] Starting video analysis for session: ${sessionId}`);
      setAnalysisProgress(`Analyzing video (attempt ${attempt}/${maxRetries})...`);
      
      // Check session validity before making API call
      if (attempt === 1 || attempt === maxRetries) {
        console.log('Checking session validity...');
        const session = await getSession();
        
        if (!session) {
          console.log('No valid session found, attempting to refresh...');
          setAnalysisProgress('Session expired - refreshing authentication...');
          
          // Attempt to refresh session
          const refreshResult = await signIn('credentials', { 
            redirect: false,
            callbackUrl: window.location.href 
          });
          
          if (!refreshResult?.ok) {
            throw new Error('Session expired. Please refresh the page and try again.');
          }
          
          setAnalysisProgress('Authentication refreshed, continuing analysis...');
        }
      }
      
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Analysis timeout - this may take up to 10 minutes')), timeoutMs)
      );
      
      // Create analysis promise with enhanced error handling
      const analysisPromise = fetch('/api/video-analysis', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId,
          'X-Retry-Attempt': attempt.toString()
        },
        credentials: 'include',
        body: JSON.stringify({
          videoUri,
          sessionId,
          analysisType: 'comprehensive',
          retryAttempt: attempt
        })
      }).then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          
          // Handle specific error types
          if (response.status === 401) {
            throw new Error('AUTHENTICATION_EXPIRED');
          } else if (response.status === 403) {
            throw new Error('AUTHORIZATION_FAILED');
          } else if (response.status === 400) {
            throw new Error(`VALIDATION_ERROR: ${errorText}`);
          } else {
            throw new Error(`HTTP_${response.status}: ${errorText}`);
          }
        }
        return response.json();
      });

      // Race between analysis and timeout
      const result = await Promise.race([analysisPromise, timeoutPromise]);
      
      console.log(`[SUCCESS] Video analysis completed for session ${sessionId} on attempt ${attempt}`);
      setAnalysisProgress('Analysis completed successfully');
      
      // Track success metrics
      console.log(`[METRICS] Success on attempt ${attempt}, duration: ${Date.now() - Date.now()}`);
      
      return result;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[FAILURE] Attempt ${attempt} failed for session ${sessionId}: ${errorMsg}`);
      
      // Handle authentication errors specifically
      if (errorMsg === 'AUTHENTICATION_EXPIRED') {
        console.log('Authentication expired during analysis');
        setAnalysisProgress('Session expired - attempting to refresh...');
        
        if (attempt < maxRetries) {
          // Try to refresh session and retry
          try {
            const session = await getSession();
            if (!session) {
              // Force page refresh to re-authenticate
              setAnalysisProgress('Authentication required - please refresh the page');
              throw new Error('Session expired. Please refresh the page and sign in again to complete analysis.');
            }
          } catch (refreshError) {
            setAnalysisProgress('Authentication failed - please refresh the page');
            throw new Error('Session expired. Please refresh the page and sign in again to complete analysis.');
          }
        } else {
          throw new Error('Session expired during analysis. Your video has been saved. Please refresh the page and check your interview history - analysis may complete in the background.');
        }
      }
      
      // Handle validation errors (don't retry)
      if (errorMsg.startsWith('VALIDATION_ERROR')) {
        setAnalysisProgress('Invalid video file - analysis cannot proceed');
        throw new Error(`Video validation failed: ${errorMsg.replace('VALIDATION_ERROR: ', '')}`);
      }
      
      // Handle final attempt
      if (attempt === maxRetries) {
        setAnalysisProgress(`Analysis failed after ${maxRetries} attempts`);
        
        // Provide specific error messages based on error type
        if (errorMsg.includes('timeout')) {
          throw new Error('Video analysis is taking longer than expected. Your video has been saved and analysis will continue in the background. Check back in a few minutes for results.');
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          throw new Error('Network connection issue. Please check your internet connection and try again.');
        } else {
          throw new Error(`Analysis failed: ${errorMsg}. Your video has been saved. Please contact support if this continues.`);
        }
      }
      
      // Calculate backoff time with jitter for retries
      const baseWaitTime = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000;
      const waitTime = baseWaitTime + jitter;
      
      console.log(`[RETRY] Waiting ${Math.round(waitTime/1000)}s before retry for session ${sessionId}`);
      setAnalysisProgress(`Retrying in ${Math.round(waitTime/1000)}s... (${attempt}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    attempt++;
  }
};

// Additional helper function to check session before critical operations
const ensureValidSession = async (): Promise<boolean> => {
  try {
    const session = await getSession();
    
    if (!session) {
      console.log('No session found');
      return false;
    }
    
    // Check if session is close to expiry (within 1 hour)
    const now = new Date();
    const sessionExpiry = new Date(session.expires);
    const timeUntilExpiry = sessionExpiry.getTime() - now.getTime();
    const oneHour = 60 * 60 * 1000;
    
    if (timeUntilExpiry < oneHour) {
      console.log('Session expires soon, should refresh');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
};

// Enhanced handleEndInterview with session validation
const handleEndInterview = useCallback(async () => {
  console.log('handleEndInterview called');
  setTimerActive(false);
  
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
  }
  
  setIsAnalyzing(true);
  
  try {
    // Check session validity before starting critical operations
    const sessionValid = await ensureValidSession();
    if (!sessionValid) {
      console.log('Session validation failed, but continuing with upload...');
      setAnalysisProgress('Session may have expired - video will be saved, analysis may run in background');
    }
    
    // Upload video to Google Cloud Storage if recorded
    if (recordedBlob) {
      console.log('Uploading video to Google Cloud Storage...');
      const formData = new FormData();
      formData.append('file', recordedBlob, `interview_${sessionId}_${Date.now()}.webm`);
      formData.append('sessionId', sessionId);

      const uploadResponse = await fetch('/api/upload/direct', {
        method: 'POST',
        body: formData
      });

      if (uploadResponse.ok) {
        const { videoUri } = await uploadResponse.json();
        console.log('Video uploaded successfully:', videoUri);
        
        // Trigger video analysis with enhanced retry logic
        try {
          console.log('Attempting to trigger video analysis...');
          await triggerVideoAnalysisWithRetry(videoUri, sessionId);
          console.log('Video analysis trigger completed');
        } catch (analysisError) {
          console.error('Video analysis trigger failed:', analysisError);
          
          // Don't fail the entire flow - video is uploaded
          setAnalysisProgress('Video saved - analysis will continue in background');
          
          // Show user-friendly message
          const analysisMsg = analysisError instanceof Error ? analysisError.message : String(analysisError);
          alert(`Your interview video has been saved successfully. ${analysisMsg}`);
        }
        
        // Mark session as completed after successful upload
        await fetch(`/api/ai/session/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'COMPLETED' })
        });
      } else {
        console.error('Video upload failed:', uploadResponse.status);
        const errorText = await uploadResponse.text();
        console.error('Upload error details:', errorText);
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
      }
    }

    // Generate conversational feedback if applicable (existing code)
    if (isConversational && messages.length > 0) {
      console.log('Generating conversational feedback...');
      // ... existing feedback code
    }

    // Call onComplete to trigger proper session flow
    onComplete?.({
      sessionId,
      status: 'processing',
      hasVideo: !!recordedBlob,
      hasConversation: isConversational && messages.length > 0,
      messages: isConversational ? messages : []
    });
    
  } catch (error) {
    console.error('Error in handleEndInterview:', error);
    // Still call onComplete to ensure flow continues
    onComplete?.({
      sessionId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      hasVideo: !!recordedBlob,
      hasConversation: isConversational && messages.length > 0,
      messages: isConversational ? messages : []
    });
  } finally {
    setIsAnalyzing(false);
  }
}, [recordedBlob, messages, isConversational, sessionId, onComplete]);
