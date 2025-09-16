import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SpeechClient, protos } from '@google-cloud/speech';
import { PassThrough } from 'stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize Speech-to-Text client with increased timeout settings (ADC)
const speechClient = new SpeechClient({
  apiEndpoint: 'speech.googleapis.com',
  // Increased timeout to reduce DEADLINE_EXCEEDED/408 for longer answers (10 minutes)
  timeout: 600000,
});

// Log that we've updated the timeout configuration
console.log('[API] Speech-to-Text client configured with extended timeout: 600 seconds');

// Create a custom handler specifically for HTTP 408 Request Timeout errors
const handle408TimeoutError = (error: any, sessionId: string): boolean => {
  // Check if this is a 408 timeout error
  if (error && error.code === 2 && // gRPC error code 2 is UNKNOWN
      error.details && error.details.includes('408:Request Timeout')) {
    console.warn(`[API] Detected HTTP 408 Request Timeout for session ${sessionId}`);
    return true;
  }
  return false;
};

interface StreamData {
  userId: string;
  startTime: number;
  transcript: string;
  isComplete: boolean;
  chunks: string[];
  confidence: number;
  // Reference to the actual streaming gRPC connection
  streamRequest?: any;
  audioStream?: PassThrough;
  // Track error states
  hasTimeoutError?: boolean;
  reconnectAttempts?: number;
  // Diagnostics
  lastDataAt?: number;
  resultCount?: number;
  // Persist selected encoding and mime type for reconnections and diagnostics
  selectedEncoding?: 'WEBM_OPUS' | 'OGG_OPUS';
  selectedMimeType?: string;
  // Additional diagnostics
  bytesSent?: number;
  firstChunkSignature?: string;
  // Track the latest interim transcript separately from the cumulative final text
  latestInterim?: string;
  // Track the best (longest) interim transcript seen in the session
  bestInterim?: string;
}

// Global variable to store streaming contexts for active sessions
const activeStreams = new Map<string, StreamData>();

// Removed unused sessionAudioChunks map to avoid confusion

/**
 * Helper function to get authenticated user ID from various auth methods
 */
async function getAuthenticatedUserId(request: NextRequest): Promise<string | undefined> {
  // Try to get user from JWT token first
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  
  // Then try to get user from database session
  const session = await getServerSession(authOptions);
  
  // Get user ID from either JWT token or session
  let userId = token?.sub || session?.user?.id;
  
  // If no JWT or session, check for database session directly
  if (!userId) {
    // Check session token (support secure and non-secure cookie names)
    let sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
      || request.cookies.get('next-auth.session-token')?.value;
    
    // If not found, check for database-specific session token (for hybrid fallback)
    if (!sessionToken) {
      sessionToken = request.cookies.get('next-auth.database-session')?.value;
      if (sessionToken) {
        console.log('[API] Found database-specific session token');
      }
    }
    
    if (sessionToken) {
      console.log('[API] Checking database session with token');
      try {
        const dbSession = await prisma.session.findUnique({
          where: { sessionToken },
          include: { user: true },
        });
        
        if (dbSession && dbSession.expires > new Date()) {
          userId = dbSession.userId;
          console.log('[API] Authenticated via database session for user ID:', userId);
        } else {
          console.log('[API] Database session invalid or expired');
        }
      } catch (error) {
        console.error('[API] Error checking database session:', error);
      }
    }
  }
  
  return userId;
}

/**
 * Start a new streaming recognition session or stop an existing one
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/speech-stream-v2 - Handling streaming request');
    
    // Auth check
    const userId = await getAuthenticatedUserId(request);
    
    if (!userId) {
      console.error('[API] Unauthorized speech-stream-v2 request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for speech-stream-v2: ${userId}`);

    // Parse request data
    const { sessionId, startStream, mimeType } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // If we're starting a new stream
    if (startStream) {
      console.log(`[API] Starting new streaming session: ${sessionId}`);

      // Create a PassThrough stream to pipe audio data to the Speech API
      const audioStream = new PassThrough();
      
      // Configure the streaming recognition
      // Determine encoding from client-provided mimeType
      const encodingFromMime = (() => {
        const mt = (mimeType || '').toLowerCase();
        if (mt.includes('ogg')) return 'OGG_OPUS' as const;
        if (mt.includes('webm')) return 'WEBM_OPUS' as const;
        return 'WEBM_OPUS' as const; // default
      })();

      console.log(`[API] Session ${sessionId} requested mimeType="${mimeType || 'unknown'}" -> using encoding ${encodingFromMime}`);

      const encodingEnum = encodingFromMime === 'OGG_OPUS'
        ? protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS
        : protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS;

      const streamingConfig = {
        config: {
          // Use enum for compressed formats; don't force sampleRateHertz
          encoding: encodingEnum,
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'latest_long',
          useEnhanced: true,
          metadata: {
            interactionType: 'DISCUSSION' as const,
            microphoneDistance: 'NEARFIELD' as const,
            recordingDeviceType: 'PC' as const,
          },
          speechContexts: [{
            phrases: [
              // Common interview phrases to help with recognition
              'interview', 'experience', 'background', 'skills', 'project',
              'strengths', 'weaknesses', 'challenges', 'accomplishments',
              'leadership', 'teamwork', 'communication', 'problem', 'solution',
              'career', 'opportunity', 'goals', 'growth', 'learn', 'develop'
            ],
            boost: 10
          }],
          audioChannelCount: 1,
          enableWordTimeOffsets: false,
          maxAlternatives: 1,
        },
        interimResults: true,
        singleUtterance: false,
      };
      
      // Start the streaming recognition with proper error handling
      const streamRequest = speechClient.streamingRecognize(streamingConfig)
        .on('error', (error: any) => {
          console.error(`[API] Streaming error for session ${sessionId}:`, error);
          
          // Handle DEADLINE_EXCEEDED errors specifically
          if (error.code === 4) { // 4 = DEADLINE_EXCEEDED
            console.log(`[API] DEADLINE_EXCEEDED for session ${sessionId}. Stream timed out.`);
            
            // Update stream status to indicate the error
            const streamData = activeStreams.get(sessionId);
            if (streamData) {
              streamData.hasTimeoutError = true;
              
              // Keep the existing transcript if we have one
              if (streamData.transcript) {
                console.log(`[API] Preserving ${streamData.transcript.length} chars of transcript before timeout`);
              }
            }
          }
          // Handle HTTP 408 Request Timeout errors
          else if (error.code === 2 && error.details && error.details.includes('408:Request Timeout')) {
            console.log(`[API] HTTP 408 Request Timeout for session ${sessionId}. Connection timed out.`);
            
            // Mark the stream for reconnection
            const streamData = activeStreams.get(sessionId);
            if (streamData) {
              streamData.hasTimeoutError = true;
              
              // Keep the existing transcript if we have one
              if (streamData.transcript) {
                console.log(`[API] Preserving ${streamData.transcript.length} chars of transcript before HTTP 408 timeout`);
              }
              
              // Log detailed error for diagnostics
              console.log(`[API] HTTP 408 error details: ${JSON.stringify({
                code: error.code,
                details: error.details,
                metadata: error.metadata ? 'Present' : 'None',
                errorTime: new Date().toISOString()
              })}`);
            }
          }
        })
        .on('data', (data: any) => {
          // Process streaming results
          if (data.results && data.results.length > 0) {
            const streamData = activeStreams.get(sessionId);
            if (!streamData) return;

            // Diagnostics
            streamData.lastDataAt = Date.now();
            streamData.resultCount = (streamData.resultCount || 0) + 1;

            const result = data.results[0];
            const isFinal = result.isFinal;
            
            if (result.alternatives && result.alternatives.length > 0) {
              const transcript = result.alternatives[0].transcript || '';
              const confidence = result.alternatives[0].confidence || 0;
              
              // Store the transcript
              if (isFinal) {
                console.log(`[API] Final transcript received: "${transcript}" (${confidence.toFixed(2)})`);
                streamData.chunks.push(transcript);
                
                // Update the complete transcript
                const cleanedChunks = streamData.chunks
                  .filter(chunk => chunk.trim().length > 0)
                  .map(chunk => chunk.trim());
                
                streamData.transcript = cleanedChunks.join(' ');
                streamData.confidence = confidence;
              } else {
                console.log(`[API] Interim transcript: "${transcript}" (event #${streamData.resultCount})`);
                // Keep latest interim transcript so UI can display it
                streamData.transcript = transcript;
                streamData.latestInterim = transcript;
                // Update best interim if this one is longer
                if (!streamData.bestInterim || transcript.length > streamData.bestInterim.length) {
                  streamData.bestInterim = transcript;
                }
              }
            }
          }
        })
        .on('end', () => {
          console.log(`[API] Recognizer stream ended for session ${sessionId}`);
        });

      // Store session info in the map
      activeStreams.set(sessionId, {
        userId,
        startTime: Date.now(),
        transcript: '',
        isComplete: false,
        chunks: [],
        confidence: 0,
        streamRequest,
        audioStream,
        hasTimeoutError: false,
        reconnectAttempts: 0,
        lastDataAt: Date.now(),
        resultCount: 0,
        selectedEncoding: encodingFromMime,
        selectedMimeType: mimeType || undefined,
        bytesSent: 0,
        firstChunkSignature: undefined,
        latestInterim: '',
        bestInterim: '',
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Streaming session started', 
        sessionId 
      });
    }
    
    // If we're ending a stream and getting final results
    const streamData = activeStreams.get(sessionId);
    if (!streamData) {
      return NextResponse.json({ error: 'No active streaming session found' }, { status: 404 });
    }
    
    console.log(`[API] Finalizing speech recognition for session ${sessionId}`);    
    
    // End the streams properly (audio and recognizer)
    if (streamData.audioStream) {
      try {
        // Signal end of audio stream
        streamData.audioStream.end();
        console.log(`[API] Audio stream ended for session ${sessionId}`);
      } catch (endError) {
        console.error(`[API] Error ending audio stream:`, endError);
      }
    }

    if (streamData.streamRequest && typeof streamData.streamRequest.end === 'function') {
      try {
        streamData.streamRequest.end();
        console.log(`[API] Recognizer stream end signaled for session ${sessionId}`);
      } catch (endErr) {
        console.error(`[API] Error ending recognizer stream:`, endErr);
      }
    }

    // Wait for recognizer to flush final results using a quiet-period or max timeout strategy
    const MAX_WAIT_MS = 20000;
    const QUIET_PERIOD_MS = 2500;
    await new Promise<void>((resolve) => {
      let settled = false;
      const startedAt = Date.now();
      let lastResultCount = streamData.resultCount || 0;
      const done = (reason?: string) => {
        if (settled) return;
        settled = true;
        if (streamData.streamRequest) {
          streamData.streamRequest.removeListener('end', onEnd);
          streamData.streamRequest.removeListener('error', onError);
        }
        console.log(`[API] Finalization: ${reason || 'completed'} for session ${sessionId}`);
        resolve();
      };
      const onEnd = () => done(`recognizer 'end' received`);
      const onError = (e: any) => {
        console.warn(`[API] Finalization: recognizer error for session ${sessionId}:`, e);
        done('recognizer error');
      };
      if (streamData.streamRequest) {
        streamData.streamRequest.once('end', onEnd);
        streamData.streamRequest.once('error', onError);
      }
      const interval = setInterval(() => {
        const now = Date.now();
        const rc = streamData.resultCount || 0;
        const lastDataAt = streamData.lastDataAt || 0;
        const progressed = rc > lastResultCount;
        if (progressed) lastResultCount = rc;
        const quietEnough = now - lastDataAt >= QUIET_PERIOD_MS;
        const timedOut = now - startedAt >= MAX_WAIT_MS;
        if (quietEnough || timedOut) {
          clearInterval(interval);
          done(quietEnough ? `quiet period ${QUIET_PERIOD_MS}ms reached` : `max wait ${MAX_WAIT_MS}ms reached`);
        }
      }, 200);
    });
    
    // Prepare the response with the accumulated transcript
    // Log diagnostics at finalization
    console.log(`[API] Final diagnostics for ${sessionId}: `, {
      resultCount: streamData.resultCount || 0,
      lastDataAt: streamData.lastDataAt || null,
      encoding: streamData.selectedEncoding || null,
      mimeType: streamData.selectedMimeType || null,
      bytesSent: streamData.bytesSent || 0,
      firstChunkSignature: streamData.firstChunkSignature || null,
    });

    // Build final transcript using finalized chunks and, if present, the latest interim partial
    const finalizedChunks = (streamData.chunks || [])
      .filter(chunk => typeof chunk === 'string' && chunk.trim().length > 0)
      .map(chunk => chunk.trim());
    let finalTranscript = finalizedChunks.join(' ');
    const interimCandidate = (
      streamData.bestInterim && streamData.bestInterim.trim().length > 0
        ? streamData.bestInterim
        : (streamData.latestInterim || streamData.transcript || '')
    ).trim();
    if (interimCandidate && !finalTranscript.includes(interimCandidate)) {
      finalTranscript = (finalTranscript ? finalTranscript + ' ' : '') + interimCandidate;
    }

    const response = {
      success: true,
      sessionId,
      transcript: finalTranscript,
      confidence: streamData.confidence,
      processingTimeMs: Date.now() - streamData.startTime,
      chunkCount: (streamData.chunks || []).length,
      diagnostics: {
        resultCount: streamData.resultCount || 0,
        lastDataAt: streamData.lastDataAt || null,
        encoding: streamData.selectedEncoding || null,
        mimeType: streamData.selectedMimeType || null,
        bytesSent: streamData.bytesSent || 0,
        firstChunkSignature: streamData.firstChunkSignature || null
      }
    };
    
    // Clean up the session
    activeStreams.delete(sessionId);
    
    return NextResponse.json(response);

  } catch (error) {
    console.error('[API] Speech-stream-v2 error:', error);
    return NextResponse.json(
      { error: 'Speech recognition failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Stream audio data to an existing session
 */
export async function PUT(request: NextRequest) {
  try {
    // Check auth
    const userId = await getAuthenticatedUserId(request);
    
    if (!userId) {
      console.error('[API] Unauthorized speech-stream-v2 streaming request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data to get audio chunk and sessionId
    const formData = await request.formData();
    const audioChunk = formData.get('audio') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!audioChunk || !sessionId) {
      return NextResponse.json({ error: 'Audio chunk and sessionId required' }, { status: 400 });
    }

    // Verify stream exists and is active
    const streamData = activeStreams.get(sessionId);
    if (!streamData) {
      return NextResponse.json({ error: 'No active streaming session found' }, { status: 404 });
    }

    // Process the audio chunk
    const arrayBuffer = await audioChunk.arrayBuffer();
    const audioContent = Buffer.from(arrayBuffer);
    const fileName = (audioChunk as any).name || 'unknown';

    // Check if audio chunk is too large (max 25KB recommended for streaming)
    const MAX_CHUNK_SIZE_KB = 25;
    if (audioContent.length > MAX_CHUNK_SIZE_KB * 1024) {
      console.warn(`[API] Audio chunk too large (${Math.round(audioContent.length/1024)}KB > ${MAX_CHUNK_SIZE_KB}KB). Consider reducing chunk size.`);
    }
    
    // Check if we need to reconnect due to a timeout
    if (streamData.hasTimeoutError) {
      console.log(`[API] Attempting to reconnect timed out stream for session ${sessionId}`);
      
      // Only attempt reconnection if we haven't exceeded the maximum attempts
      const MAX_RECONNECT_ATTEMPTS = 3;
      if ((streamData.reconnectAttempts || 0) < MAX_RECONNECT_ATTEMPTS) {
        try {
          // Close existing stream connections
          if (streamData.audioStream) {
            try { streamData.audioStream.end(); } catch (e) { /* ignore */ }
          }
          
          // Create new streams
          const audioStream = new PassThrough();
          
          // Same config as in POST handler
          const reEnc = (streamData.selectedEncoding || 'WEBM_OPUS') === 'OGG_OPUS'
            ? protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS
            : protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS;

          const streamingConfig = {
            config: {
              encoding: reEnc,
              sampleRateHertz: 48000,
              languageCode: 'en-US',
              enableAutomaticPunctuation: true,
              model: 'latest_long',
              useEnhanced: true,
              metadata: {
                interactionType: 'DISCUSSION' as const,
                microphoneDistance: 'NEARFIELD' as const,
                recordingDeviceType: 'PC' as const,
              },
              speechContexts: [{
                phrases: [
                  'interview', 'experience', 'background', 'skills', 'project',
                  'strengths', 'weaknesses', 'challenges', 'accomplishments',
                  'leadership', 'teamwork', 'communication', 'problem', 'solution',
                  'career', 'opportunity', 'goals', 'growth', 'learn', 'develop'
                ],
                boost: 10
              }],
              audioChannelCount: 1,
              enableWordTimeOffsets: false,
              maxAlternatives: 1,
            },
            interimResults: true,
            singleUtterance: false,
          };
          
          // Start new streaming recognition
          const streamRequest = speechClient.streamingRecognize(streamingConfig)
            .on('error', (error: any) => {
              console.error(`[API] Reconnected stream error for session ${sessionId}:`, error);
              if (error.code === 4) { // DEADLINE_EXCEEDED again
                streamData.hasTimeoutError = true;
              }
            })
            .on('data', (data: any) => {
              // Mirror the initial stream logic, including interim handling and diagnostics
              if (data.results && data.results.length > 0) {
                const currentStreamData = activeStreams.get(sessionId);
                if (!currentStreamData) return;

                // Diagnostics
                currentStreamData.lastDataAt = Date.now();
                currentStreamData.resultCount = (currentStreamData.resultCount || 0) + 1;

                const result = data.results[0];
                const isFinal = result.isFinal;
                
                if (result.alternatives && result.alternatives.length > 0) {
                  const transcript = result.alternatives[0].transcript || '';
                  const confidence = result.alternatives[0].confidence || 0;
                  
                  if (isFinal) {
                    console.log(`[API] Final transcript (reconnected): "${transcript}" (${confidence.toFixed(2)})`);
                    currentStreamData.chunks.push(transcript);
                    
                    const cleanedChunks = currentStreamData.chunks
                      .filter(chunk => chunk.trim().length > 0)
                      .map(chunk => chunk.trim());
                    
                    currentStreamData.transcript = cleanedChunks.join(' ');
                    currentStreamData.confidence = confidence;
                  } else {
                    // Update interim transcript so clients receive fresh interim text after reconnection
                    currentStreamData.transcript = transcript;
                    currentStreamData.latestInterim = transcript;
                    if (!currentStreamData.bestInterim || transcript.length > currentStreamData.bestInterim.length) {
                      currentStreamData.bestInterim = transcript;
                    }
                  }
                }
              }
            });

          // Update stream data with new connections
          streamData.audioStream = audioStream;
          streamData.streamRequest = streamRequest;
          streamData.hasTimeoutError = false;
          streamData.reconnectAttempts = (streamData.reconnectAttempts || 0) + 1;
          
          console.log(`[API] Stream reconnected for session ${sessionId} (attempt ${streamData.reconnectAttempts})`);
        } catch (reconnectError) {
          console.error(`[API] Failed to reconnect stream:`, reconnectError);
          return NextResponse.json({ 
            error: 'Failed to reconnect stream', 
            details: reconnectError instanceof Error ? reconnectError.message : 'Unknown error',
            recovered: false,
            currentTranscript: streamData.transcript || ''
          }, { status: 500 });
        }
      } else {
        console.log(`[API] Maximum reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for session ${sessionId}`);
        return NextResponse.json({
          warning: 'Maximum reconnect attempts reached',
          recovered: false,
          currentTranscript: streamData.transcript || ''
        });
      }
    }

    // Add timing information for diagnostics
    const chunkProcessStartTime = Date.now();

    // Write the audio chunk to the recognizer stream
    if (streamData.streamRequest) {
      try {
        // Avoid writes if the underlying stream has been destroyed/ended due to a prior error
        const req: any = streamData.streamRequest as any;
        if (req?.destroyed || req?.writableEnded || req?.writableFinished) {
          return NextResponse.json({
            error: 'Recognizer stream not available',
            details: 'The recognizer stream has ended due to a prior error. Please reinitialize the stream.'
          }, { status: 409 });
        }
        // Log signature of the first chunk to verify container format
        if (!streamData.firstChunkSignature) {
          const head = audioContent.subarray(0, 12);
          streamData.firstChunkSignature = head.toString('hex');
          console.log(`[API] First chunk signature for ${sessionId} (${fileName}): ${streamData.firstChunkSignature}`);
        }

        // Update diagnostics
        streamData.bytesSent = (streamData.bytesSent || 0) + audioContent.length;

        // Send raw audio bytes to the duplex stream (client library wraps appropriately)
        streamData.streamRequest.write(audioContent);

        const processingTime = Date.now() - chunkProcessStartTime;
        console.log(`[API] Audio chunk sent to recognizer (${audioContent.length} bytes) in ${processingTime}ms`);

        return NextResponse.json({
          success: true,
          interim: true,
          message: 'Audio chunk processed',
          processingTime: processingTime,
          // Return whatever transcript we currently have so UI can show interim text
          transcript: streamData.transcript || ''
        });
      } catch (writeError) {
        console.error('[API] Error writing to recognizer stream:', writeError);
        return NextResponse.json({ 
          error: 'Recognizer stream write error', 
          details: writeError instanceof Error ? writeError.message : 'Unknown error' 
        }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Recognizer stream not initialized' }, { status: 500 });
    }
  } catch (error) {
    console.error('[API] Speech streaming error:', error);
    return NextResponse.json(
      { error: 'Speech streaming failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
