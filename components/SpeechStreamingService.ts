/**
 * SpeechStreamingService.ts
 * Service to handle real-time speech streaming to Speech-to-Text v2 API
 */

type StreamingStatus = 'idle' | 'streaming' | 'processing' | 'completed' | 'error';

interface StreamingConfig {
  sessionId: string;
  onInterimResult?: (result: any) => void;
  onInterimTranscript?: (transcript: string) => void; // Added property for raw transcript handling
  onFinalResult?: (result: any) => void;
  onError?: (error: Error) => void;
  chunkInterval?: number; // How often to send chunks in ms
  debugMode?: boolean; // Enable detailed performance metrics and logging
  onMetrics?: (metrics: PerformanceMetrics) => void; // Callback for performance metrics updates
}

interface PerformanceMetrics {
  chunksSent: number;
  bytesProcessed: number;
  totalLatency: number;
  processingStartTime: number | null;
  requestTimestamps: {
    chunkId: number;
    sentAt: number;
    receivedAt?: number;
    size: number;
    error?: string;
  }[];
  averageLatency: number;
  timeoutCount?: number;
  reconnectCount?: number;
  recoveredTranscripts?: number;
}

class SpeechStreamingService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private status: StreamingStatus = 'idle';
  private sessionId: string = '';
  private chunkInterval: number;
  private processingInterval: NodeJS.Timeout | null = null;
  private chunkCounter: number = 0;
  private isDisposed: boolean = false;
  private selectedMimeType: string = '';
  
  // Performance monitoring
  private metrics: PerformanceMetrics = {
    chunksSent: 0,
    bytesProcessed: 0,
    totalLatency: 0,
    processingStartTime: null,
    requestTimestamps: [],
    averageLatency: 0
  };
  private debugMode: boolean = false;
  
  // Callbacks
  private onInterimResult: ((result: any) => void) | undefined;
  private onInterimTranscript: ((transcript: string) => void) | undefined;
  private onFinalResult: ((result: any) => void) | undefined;
  private onError: ((error: Error) => void) | undefined;
  
  // Additional callback for metrics
  private onMetrics: ((metrics: PerformanceMetrics) => void) | undefined;

  constructor(config: StreamingConfig) {
    this.sessionId = config.sessionId;
    this.onInterimResult = config.onInterimResult;
    this.onInterimTranscript = config.onInterimTranscript;
    this.onFinalResult = config.onFinalResult;
    this.onError = config.onError;
    this.onMetrics = config.onMetrics;
    // Default to 2000ms to allow longer utterances while keeping chunk size manageable
    this.chunkInterval = config.chunkInterval || 2000;
    this.debugMode = config.debugMode || false;
    
    // Reset metrics
    this.resetMetrics();
    
    if (this.debugMode) {
      console.log('🔍 Speech streaming service initialized with debug mode enabled');
    }
  }
 
  /**
   * Reinitialize server recognizer stream after it has ended (HTTP 409)
   */
  private async reinitServerStream(): Promise<boolean> {
    try {
      if (this.debugMode) {
        console.warn('🔍 [Speech] Attempting to reinitialize server stream (HTTP 409)');
      }
      const response = await fetch('/api/ai/speech-stream-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Method': 'hybrid-session'
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          startStream: true,
          mimeType: this.selectedMimeType || 'audio/webm;codecs=opus'
        })
      });
      if (response.ok) {
        // Track reconnect attempts
        if (this.metrics.reconnectCount !== undefined) {
          this.metrics.reconnectCount++;
        } else {
          this.metrics.reconnectCount = 1;
        }
        if (this.debugMode) {
          console.log('🔍 [Speech] Server stream reinitialized successfully');
        }
        return true;
      } else {
        const txt = await response.text().catch(() => '');
        console.warn('🔍 [Speech] Failed to reinitialize server stream:', response.status, txt);
        return false;
      }
    } catch (e) {
      console.error('🔍 [Speech] Error reinitializing server stream:', e);
      return false;
    }
  }
 
  
  /**
   * Reset performance metrics
   */
  private resetMetrics() {
    this.metrics = {
      chunksSent: 0,
      bytesProcessed: 0,
      totalLatency: 0,
      processingStartTime: null,
      requestTimestamps: [],
      averageLatency: 0
    };
    this.chunkCounter = 0;
  }
  
  /**
   * Start streaming audio to the API
   */
  async startStreaming(stream: MediaStream): Promise<boolean> {
    if (this.status === 'streaming') {
      console.warn('Speech streaming already in progress');
      return false;
    }
    
    try {
      // Store the stream
      this.stream = stream;
      
      // Check supported MIME types for MediaRecorder
      const mimeTypes = [
        // Prefer OGG Opus when available; it's well-supported by Google STT for streaming
        'audio/ogg;codecs=opus',
        // WebM Opus as a fallback
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.5',
        'audio/mp4',
        'audio/mpeg'
      ];
      
      // Find the first supported MIME type
      let supportedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          supportedMimeType = type;
          if (this.debugMode) {
            console.log(`🔍 [Speech] Using supported MIME type: ${supportedMimeType}`);
          }
          break;
        }
      }
      
      if (!supportedMimeType) {
        throw new Error('No supported audio MIME types found for MediaRecorder');
      }
      
      // Initialize the media recorder with supported MIME type
      const options: MediaRecorderOptions = {
        mimeType: supportedMimeType,
        // Use 96kbps so a 2s chunk ≈ 24KB, staying within recommended 25KB streaming chunk size
        audioBitsPerSecond: 96000
      };
      
      if (this.debugMode) {
        console.log(`🔍 [Speech] Creating MediaRecorder with options:`, options);
      }
      
      // Create an audio-only stream if needed
      const audioStream = new MediaStream(
        stream.getAudioTracks().map(track => {
          // Clone the track to avoid modifying original stream
          const clonedTrack = track.clone();
          return clonedTrack;
        })
      );
      
      // Initialize the media recorder with audio-only stream
      this.mediaRecorder = new MediaRecorder(audioStream, options);
      this.selectedMimeType = supportedMimeType;
      
      // Reset chunks
      this.chunks = [];
      
      // Log browser and MediaRecorder support details in debug mode
      if (this.debugMode) {
        console.log(`🔍 [Speech] Browser: ${navigator.userAgent}`);
        console.log(`🔍 [Speech] MediaRecorder supported: ${typeof MediaRecorder !== 'undefined'}`);
        console.log(`🔍 [Speech] Audio tracks: ${audioStream.getAudioTracks().length}`);
      }
      
      // Start a new session with the API
      const response = await fetch('/api/ai/speech-stream-v2', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Auth-Method': 'hybrid-session'
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          startStream: true,
          mimeType: supportedMimeType // Send the selected MIME type to backend
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to start streaming session: ${error}`);
      }
      
      // Set up data recording handlers
      this.mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0) {
          // Store the audio blob
          if (!this.isDisposed) {
            // Process the audio data using optimized chunking
            await this.processLatestChunk(event.data);
          }
        }
      });
      
      // Optimize chunk size for better reliability with Google Speech API
      // Using 1500ms chunks helps reduce network overhead and provides enough
      // audio for good transcription while staying below timeout thresholds
      this.mediaRecorder.start(this.chunkInterval);  // Use configured chunk interval
      this.status = 'streaming';
      
      // Note: We rely solely on MediaRecorder 'dataavailable' events to process chunks
      // to avoid duplicate sends. No additional polling interval is used.
      
      console.log('🎙️ Speech streaming started');
      return true;
    } catch (error) {
      console.error('Error starting speech streaming:', error);
      this.status = 'error';
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
  
  /**
   * Process the latest audio chunk and send it to the API
   * @param audioBlob Optional audio blob to process directly
   */
  private async processLatestChunk(audioBlob?: Blob) {
    // Process only the provided blob from the MediaRecorder event.
    // If nothing is provided (e.g., from a polling call), do nothing.
    if (!audioBlob || audioBlob.size === 0 || this.status !== 'streaming') {
      return;
    }
    
    // Set processing start time if this is the first chunk
    if (this.metrics.processingStartTime === null) {
      this.metrics.processingStartTime = Date.now();
      if (this.debugMode) {
        console.log(`🔍 [Speech] Started processing at ${new Date(this.metrics.processingStartTime).toISOString()}`);
      }
    }
    
    try {
      // Process the provided chunk
      const latestChunk = audioBlob;
      
      // Check that we have valid audio data
      if (!latestChunk || latestChunk.size === 0) {
        if (this.debugMode) {
          console.warn('🔍 [Speech] Empty audio chunk received, skipping');
        }
        return;
      }
      
      const chunkSize = latestChunk.size;
      const chunkId = this.chunkCounter++;
      
      // Track this chunk in metrics
      const sentAt = Date.now();
      const chunkTimestamp = {
        chunkId,
        sentAt,
        size: chunkSize
      };
      this.metrics.requestTimestamps.push(chunkTimestamp);
      this.metrics.chunksSent++;
      this.metrics.bytesProcessed += chunkSize;
      
      if (this.debugMode) {
        console.log(`🔍 [Speech] Sending chunk #${chunkId}, size: ${chunkSize} bytes at ${new Date(sentAt).toISOString()}`);
      }
      
      // Create form data with the audio chunk
      const formData = new FormData();
      const ext = this.selectedMimeType.includes('ogg') ? 'ogg' :
                  this.selectedMimeType.includes('webm') ? 'webm' :
                  this.selectedMimeType.includes('mp4') ? 'm4a' : 'webm';
      formData.append('audio', latestChunk, `chunk_${chunkId}_${Date.now()}.${ext}`);
      formData.append('sessionId', this.sessionId);
      
      // Send to API with timeout and retry logic
      let response;
      const MAX_RETRIES = 2;
      let retries = 0;
      let lastError = null;
      
      while (retries <= MAX_RETRIES) {
        try {
          response = await fetch('/api/ai/speech-stream-v2', {
            method: 'PUT',
            headers: {
              'X-Auth-Method': 'hybrid-session'
            },
            credentials: 'include',
            body: formData,
            // Use AbortController to set a timeout to avoid high latency
            signal: AbortSignal.timeout(10000) // Increased to 10 seconds to prevent premature timeouts
          });
          
          // If successful, break out of retry loop
          if (response.ok) break;
          
          // If recognizer stream ended on server, reinitialize and retry this chunk
          if (response.status === 409) {
            if (this.debugMode) {
              console.warn('🔍 [Speech] Server recognizer stream not available (409). Reinitializing and retrying chunk...');
            }
            const reinitOk = await this.reinitServerStream();
            if (reinitOk) {
              retries++;
              // Try sending the same chunk again immediately
              continue;
            }
            lastError = new Error('Recognizer stream not available and reinit failed');
            retries++;
            continue;
          }
          
          // Handle known error types
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          
          // Check for DEADLINE_EXCEEDED or HTTP 408 Request Timeout errors
          if (errorData.error && (errorData.error.includes('DEADLINE_EXCEEDED') || 
              errorData.error.includes('408:Request Timeout') || 
              errorData.error.includes('Request Timeout'))) {
            console.warn(`🔍 [Speech] Received timeout error, attempt ${retries + 1}/${MAX_RETRIES + 1}`);
            if (this.debugMode) {
              console.log(`🔍 [Speech] Server reported timeout: ${errorData.error}. Will try to recover...`);
            }
            // Increment timeout count in metrics if available
            if (this.metrics.timeoutCount !== undefined) {
              this.metrics.timeoutCount++;
            } else {
              this.metrics.timeoutCount = 1;
            }
          }
          
          lastError = new Error(errorData.error || 'API Error');
          retries++;
          
          // Wait before retrying
          if (retries <= MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000 * retries)); // Exponential backoff
          }
        } catch (error: unknown) {
          // Convert unknown error to a proper Error object
          lastError = error instanceof Error ? error : new Error(String(error));
          retries++;
          
          // Type guard to check error properties safely
          const errorObj = error as { name?: string, message?: string };
          
          // Special handling for 408 Request Timeout errors coming from fetch
          const isTimeoutError = 
            errorObj.name === 'TimeoutError' || 
            errorObj.name === 'AbortError' || 
            errorObj.name === 'TypeError' ||
            (errorObj.message && (
              errorObj.message.includes('timeout') ||
              errorObj.message.includes('Timeout') ||
              errorObj.message.includes('408') ||
              errorObj.message.includes('Request Timeout')
            ));
          
          if (isTimeoutError) {
            console.warn(`🔍 [Speech] Request timeout or network error, attempt ${retries}/${MAX_RETRIES + 1}`);
            if (this.debugMode) {
              console.log(`🔍 [Speech] Error details: ${errorObj.name}: ${errorObj.message}`);
            }
            
            // Track timeout in metrics
            if (this.metrics.timeoutCount !== undefined) {
              this.metrics.timeoutCount++;
            } else {
              this.metrics.timeoutCount = 1;
            }
            
            if (retries <= MAX_RETRIES) {
              await new Promise(r => setTimeout(r, 1000 * retries)); // Exponential backoff
              continue;
            }
          }
          
          // For other errors, don't retry
          throw error;
        }
      }
      
      // If we exhausted retries and still have an error
      if (!response || !response.ok) {
        console.error('Failed all retries for audio chunk processing:', lastError);
        throw lastError || new Error('Failed to process audio chunk after multiple attempts');
      }
      
      // Track response time
      const receivedAt = Date.now();
      const latency = receivedAt - sentAt;
      this.metrics.totalLatency += latency;
      
      // Update timestamp with received time
      const timestampIndex = this.metrics.requestTimestamps.findIndex(t => t.chunkId === chunkId);
      if (timestampIndex >= 0) {
        this.metrics.requestTimestamps[timestampIndex].receivedAt = receivedAt;
      }
      
      // Calculate and update average latency
      if (this.metrics.chunksSent > 0) {
        this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.chunksSent;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error processing chunk #${chunkId}:`, errorText);
        return;
      }
      
      const responseData = await response.json();
      const receivedTranscript = responseData.transcript || '';
      
      if (receivedTranscript) {
        // Store the interim transcript in session storage for potential fallback use
        try {
          sessionStorage.setItem(`transcript_${chunkId}`, JSON.stringify({
            chunkId, 
            transcript: receivedTranscript,
            timestamp: Date.now()
          }));
        } catch (e) {
          // Ignore storage errors
        }
        
        if (this.onInterimTranscript) {
          // Call interim transcript handler
          this.onInterimTranscript(receivedTranscript);
        }
      }
      
      // If we have a transcript, call the interim result callback
      if (responseData.transcript) {
        if (this.debugMode) {
          console.log(`🔍 [Speech] Received transcript for chunk #${chunkId} after ${latency}ms: "${responseData.transcript}"`);
        }
        this.onInterimResult?.(responseData);
      }
      
      // Report metrics every 5 chunks if in debug mode
      if (this.debugMode && this.metrics.chunksSent % 5 === 0) {
        this.reportMetrics();
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }
  
  /**
   * Report current performance metrics
   */
  private reportMetrics() {
    // Clone metrics to avoid modification during reporting
    const metricsSnapshot = {...this.metrics};
    
    // Calculate elapsed time if we have a start time
    if (metricsSnapshot.processingStartTime) {
      const elapsedMs = Date.now() - metricsSnapshot.processingStartTime;
      const elapsedSec = elapsedMs / 1000;
      
      console.log('🔍 [Speech] Performance Metrics:');
      console.log(`  - Elapsed time: ${elapsedSec.toFixed(2)} seconds`);
      console.log(`  - Chunks sent: ${metricsSnapshot.chunksSent}`);
      console.log(`  - Data processed: ${(metricsSnapshot.bytesProcessed / 1024).toFixed(2)} KB`);
      console.log(`  - Average latency: ${metricsSnapshot.averageLatency.toFixed(2)} ms`);
      console.log(`  - Processing rate: ${(metricsSnapshot.chunksSent / elapsedSec).toFixed(2)} chunks/second`);
      console.log(`  - Data rate: ${((metricsSnapshot.bytesProcessed / 1024) / elapsedSec).toFixed(2)} KB/second`);
    }
    
    // Call onMetrics callback if provided
    this.onMetrics?.(metricsSnapshot);
  }
  
  /**
   * Handle server error responses
   * @param error The error object or response
   */
  private handleStreamingError(error: any): void {
    let errorMessage = '';
    let errorCode = '';
    
    try {
      // Parse error if it's a response object
      if (error.json) {
        error.json().then((data: any) => {
          errorMessage = data.error || data.message || 'Unknown error';
          errorCode = data.code || '';
          
          // Handle specific error types
          if (errorCode === '4' || errorMessage.includes('DEADLINE_EXCEEDED')) {
            console.warn('🔍 [Speech] DEADLINE_EXCEEDED error detected. The streaming connection timed out.');
            // We'll rely on the retry mechanism in processLatestChunk
          }
        });
      } else {
        errorMessage = error.message || String(error);
      }
    } catch (e) {
      errorMessage = 'Error processing error response';
    }
    
    console.error('Speech streaming error:', errorMessage);
    this.onError?.(new Error(`Speech streaming error: ${errorMessage}`));
  }
  
  /**
   * Stop streaming and get final results
   */
  async stopStreaming(): Promise<any> {
    if (this.status !== 'streaming' || !this.mediaRecorder) {
      console.warn('No active streaming to stop');
      return null;
    }
    
    const stopStartTime = Date.now();
    if (this.debugMode) {
      console.log(`🔍 [Speech] Stopping streaming at ${new Date(stopStartTime).toISOString()}`);
    }
    
    try {
      // Change status to processing
      this.status = 'processing';
      
      // Stop the media recorder
      this.mediaRecorder.stop();
      
      // Clear the processing interval
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }

      // Wait a bit for any final chunks to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Send request to get final results
      // Add retry logic for final transcript
      let attempts = 0;
      let response;
      const MAX_ATTEMPTS = 3;
      const RETRY_DELAY = 500; // ms
      
      // Also check if we have any interim transcripts that can be used as backup
      let accumulatedTranscripts = '';
      
      // Try to get interim transcripts from timestamps
      this.metrics.requestTimestamps.forEach(timestamp => {
        // Find corresponding transcript if available in local storage
        const storedItem = sessionStorage.getItem(`transcript_${timestamp.chunkId}`);
        if (storedItem) {
          try {
            const parsed = JSON.parse(storedItem);
            if (parsed.transcript && typeof parsed.transcript === 'string') {
              accumulatedTranscripts += ' ' + parsed.transcript;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });
      
      // Clean up accumulated transcripts
      accumulatedTranscripts = accumulatedTranscripts.trim();
      if (this.debugMode && accumulatedTranscripts) {
        console.log(`🔍 [Speech] Accumulated interim transcripts as backup: "${accumulatedTranscripts}"`);
      }
      
      // Try multiple times to get a final transcript
      let finalResult: any = null;
      let errorText: string = '';
      
      while (attempts < MAX_ATTEMPTS) {
        try {
          response = await fetch('/api/ai/speech-stream-v2', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-Auth-Method': 'hybrid-session'
            },
            credentials: 'include',
            body: JSON.stringify({
              sessionId: this.sessionId,
              finalizeStream: true,
              preserveTranscript: true // Tell server to preserve any transcript it has even if connection timed out
            }),
            signal: AbortSignal.timeout(8000) // Increased timeout for final processing
          });
          
          if (response.ok) {
            finalResult = await response.json();
            break;
          } else {
            errorText = await response.text();
            attempts++;
            if (attempts < MAX_ATTEMPTS) {
              if (this.debugMode) {
                console.warn(`🔍 [Speech] Retrying final transcript request (${attempts}/${MAX_ATTEMPTS}): ${errorText}`);
              }
              await new Promise(r => setTimeout(r, RETRY_DELAY));
            }
          }
        } catch (error) {
          attempts++;
          errorText = error instanceof Error ? error.message : String(error);
          if (attempts < MAX_ATTEMPTS) {
            if (this.debugMode) {
              console.warn(`🔍 [Speech] Error in final transcript request, retrying (${attempts}/${MAX_ATTEMPTS}):`, error);
            }
            await new Promise(r => setTimeout(r, RETRY_DELAY));
          } else {
            throw error;
          }
        }
      }
      
      const finalEndTime = Date.now();
      const finalProcessingTime = finalEndTime - stopStartTime;
      
      // Check if we have a valid result, otherwise use accumulated transcripts as fallback
      if (!finalResult) {
        console.error(`Failed to get final streaming results: ${errorText}`);
        
        if (accumulatedTranscripts) {
          console.log(`🔍 [Speech] Using accumulated interim transcripts as fallback`);
          finalResult = {
            success: true,
            transcript: accumulatedTranscripts,
            confidence: 0.5,
            processingTimeMs: finalProcessingTime,
            fromFallback: true
          };
        } else {
          throw new Error(`Failed to get final streaming results: ${errorText}`);
        }
      }
      
      // If final transcript is empty, use accumulated transcripts if available
      if (finalResult && (!finalResult.transcript || finalResult.transcript.trim() === '')) {
        if (accumulatedTranscripts) {
          if (this.debugMode) {
            console.log(`🔍 [Speech] Using accumulated interim transcripts because final transcript was empty`);
          }
          finalResult.transcript = accumulatedTranscripts;
          finalResult.fromFallback = true;
          console.log(`🔍 [Speech] Applied fallback transcript: "${accumulatedTranscripts.substring(0, 50)}${accumulatedTranscripts.length > 50 ? '...' : ''}"`);
        } else {
          // Try to recover from sessionStorage directly if accumulatedTranscripts is empty
          try {
            let recoveredText = '';
            // Look through sessionStorage for any transcript chunks
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith('transcript_') || key?.startsWith('backup_transcript_')) {
                const storedItem = sessionStorage.getItem(key);
                if (storedItem) {
                  try {
                    const parsed = JSON.parse(storedItem);
                    if (parsed.transcript && typeof parsed.transcript === 'string') {
                      recoveredText += ' ' + parsed.transcript;
                    }
                  } catch (e) {
                    // If it's not JSON, try to use the raw string
                    if (typeof storedItem === 'string') {
                      recoveredText += ' ' + storedItem;
                    }
                  }
                }
              }
            }
            
            recoveredText = recoveredText.trim();
            if (recoveredText) {
              console.log(`🔍 [Speech] Recovered transcript from session storage: "${recoveredText.substring(0, 50)}${recoveredText.length > 50 ? '...' : ''}"`);
              finalResult.transcript = recoveredText;
              finalResult.fromFallback = true;
              finalResult.recoveredFromStorage = true;
            } else {
              console.warn(`🔍 [Speech] Could not recover any transcript from session storage`);
            }
          } catch (e) {
            console.error(`🔍 [Speech] Error attempting to recover transcript from session storage:`, e);
          }
        }
      }
      
      // Update status
      this.status = 'completed';
      
      // Calculate total processing time
      const totalTime = finalEndTime - (this.metrics.processingStartTime || stopStartTime);
      
      // Log final metrics if in debug mode
      if (this.debugMode) {
        console.log(`🔍 [Speech] Final transcript received after ${finalProcessingTime}ms`);
        console.log(`🔍 [Speech] Final transcript: "${finalResult?.transcript || '(empty)'}"`);
        console.log(`🔍 [Speech] Total streaming session completed in ${(totalTime / 1000).toFixed(2)} seconds`);
        if (finalResult?.diagnostics) {
          const { resultCount, lastDataAt } = finalResult.diagnostics;
          console.log(`🔍 [Speech] Server diagnostics: resultCount=${resultCount}, lastDataAt=${lastDataAt ? new Date(lastDataAt).toISOString() : 'n/a'}`);
        }
        
        // Generate and log final report
        this.reportMetrics();
        
        // Log detailed analysis
        console.log(`🔍 [Speech] Detailed Analysis:`);
        console.log(`  - Audio format: ${this.selectedMimeType || 'unknown'}`);  
        console.log(`  - Chunk interval: ${this.chunkInterval}ms`);        
        console.log(`  - Total chunks: ${this.metrics.chunksSent}`); 
        console.log(`  - Final processing time: ${finalProcessingTime}ms`);
        console.log(`  - Words in final transcript: ${(finalResult?.transcript?.split(' ').length || 0)} words`);
      }
      
      // Call final result callback
      this.onFinalResult?.(finalResult);
      
      // Create extended metrics with final processing details
      interface ExtendedMetrics extends PerformanceMetrics {
        finalProcessingTime: number;
        totalSessionTime: number;
        finalTranscriptLength: number;
        finalWordCount: number;
      }
      
      // Final metrics report
      const finalMetrics: ExtendedMetrics = {
        ...this.metrics,
        finalProcessingTime,
        totalSessionTime: totalTime,
        finalTranscriptLength: finalResult?.transcript?.length || 0,
        finalWordCount: finalResult?.transcript?.split(' ').length || 0
      };
      
      // Send final metrics if callback exists
      if (this.onMetrics) {
        this.onMetrics(finalMetrics as PerformanceMetrics);
      }
      
      console.log('🎙️ Speech streaming completed');
      return finalResult;
    } catch (error) {
      console.error('Error stopping speech streaming:', error);
      this.status = 'error';
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }
  
  /**
   * Get current status
   */
  getStatus(): StreamingStatus {
    return this.status;
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    this.isDisposed = true;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    if (this.mediaRecorder && this.status === 'streaming') {
      this.mediaRecorder.stop();
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.status = 'idle';
    console.log('🎙️ Speech streaming service cleaned up');
  }
}

export default SpeechStreamingService;
