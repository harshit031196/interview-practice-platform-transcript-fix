import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VideoIntelligenceServiceClient } from '@google-cloud/video-intelligence';
import { SpeechClient } from '@google-cloud/speech';

// Initialize Google Cloud clients
const videoClient = new VideoIntelligenceServiceClient({
  projectId: 'wingman-interview-470419',
});

const speechClient = new SpeechClient({
  projectId: 'wingman-interview-470419',
});

// Enhanced audio extraction function for WEBM files
async function extractAndTranscribeAudio(videoUri: string) {
  try {
    console.log('Performing dedicated audio transcription for:', videoUri);
    
    // Convert web URL to GCS URI format if needed
    if (videoUri.startsWith('https://storage.cloud.google.com/')) {
      videoUri = 'gs://' + videoUri.replace('https://storage.cloud.google.com/', '');
      console.log('Converted audio URI to GCS format:', videoUri);
    }
    
    // Configure audio recognition for WEBM/OPUS format
    const audioConfig = {
      encoding: 'WEBM_OPUS' as const,
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableSpeakerDiarization: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 1,
        maxSpeakerCount: 3,
      },
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      model: 'video', // Optimized for video content
      useEnhanced: true,
    };

    // Use Speech-to-Text API directly for better audio handling
    const [operation] = await speechClient.longRunningRecognize({
      config: audioConfig,
      audio: {
        uri: videoUri,
      },
    });

    console.log('Audio transcription operation started, waiting for completion...');
    const [response] = await operation.promise();
    console.log('Audio transcription completed');

    // Process transcription results
    if (response.results && response.results.length > 0) {
      const transcript = response.results
        .map(result => result.alternatives?.[0]?.transcript || '')
        .filter(Boolean)
        .join(' ');

      const confidence = response.results.reduce((sum, result) => 
        sum + (result.alternatives?.[0]?.confidence || 0), 0) / response.results.length;

      return {
        hasAudio: true,
        transcript,
        confidence,
        speakerCount: response.results.length,
        wordCount: transcript.split(' ').length,
        results: response.results
      };
    }

    return { hasAudio: false, transcript: '', confidence: 0, speakerCount: 0 };
  } catch (error) {
    console.error('Audio transcription error:', error);
    return { 
      hasAudio: false, 
      transcript: '', 
      confidence: 0, 
      speakerCount: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Comprehensive video analysis function
async function performVideoAnalysis(videoUri: string, analysisType: string) {
  try {
    console.log('Performing video analysis for:', videoUri);
    
    // Always convert web URL to GCS URI format if needed
    if (videoUri.startsWith('https://storage.cloud.google.com/')) {
      videoUri = 'gs://' + videoUri.replace('https://storage.cloud.google.com/', '');
      console.log('Converted video URI to GCS format:', videoUri);
    }
    
    // Additional check for other URL formats that might need conversion
    if (videoUri.includes('storage.googleapis.com')) {
      // Handle storage.googleapis.com URLs
      // Example: https://storage.googleapis.com/bucket/path -> gs://bucket/path
      videoUri = 'gs://' + videoUri.split('/').slice(3).join('/');
      console.log('Converted googleapis URL to GCS format:', videoUri);
    }
    
    // Verify the URI format is correct for Video Intelligence API
    if (!videoUri.startsWith('gs://')) {
      console.log('WARNING: Video URI does not start with gs://, this may cause issues with Video Intelligence API');
    }
    
    // Log service account info
    try {
      const [projectId, credentials] = await Promise.all([
        videoClient.getProjectId(),
        videoClient.auth.getCredentials()
      ]);
      console.log('Using Video Intelligence API with project:', projectId);
      console.log('Credentials available:', !!credentials);
    } catch (authError) {
      console.error('Failed to get authentication details:', authError);
    }
    
    // Run both video analysis and dedicated audio transcription in parallel
    console.log('Starting Video Intelligence API request with URI:', videoUri);
    const [videoAnalysisResult, audioTranscriptionResult] = await Promise.allSettled([
      // Video Intelligence API for visual analysis
      videoClient.annotateVideo({
        inputUri: videoUri,
        features: [
          'FACE_DETECTION',
          'PERSON_DETECTION', 
          'SPEECH_TRANSCRIPTION',
          'TEXT_DETECTION'
        ] as any,
        videoContext: {
          speechTranscriptionConfig: {
            languageCode: 'en-US',
            enableSpeakerDiarization: true,
            diarizationSpeakerCount: 2,
            enableAutomaticPunctuation: true,
            audioTracks: [0], // Process first audio track
          },
          faceDetectionConfig: {
            includeBoundingBoxes: true,
            includeAttributes: true,
          },
          personDetectionConfig: {
            includeBoundingBoxes: true,
            includeAttributes: true,
            includePoseLandmarks: true,
          }
        },
      }).then(([operation]) => operation.promise()),
      
      // Dedicated Speech-to-Text API for better audio handling
      extractAndTranscribeAudio(videoUri)
    ]);

    console.log('Analysis operations completed');

    // Process video analysis results
    let videoResult = null;
    if (videoAnalysisResult.status === 'fulfilled') {
      videoResult = videoAnalysisResult.value[0];
      console.log('Video analysis succeeded with result structure:', 
        JSON.stringify({
          hasAnnotationResults: !!videoResult?.annotationResults,
          resultCount: videoResult?.annotationResults?.length || 0,
          hasFaceDetection: !!videoResult?.annotationResults?.[0]?.faceDetectionAnnotations?.length,
          hasSpeechTranscription: !!videoResult?.annotationResults?.[0]?.speechTranscriptions?.length,
          hasPersonDetection: !!videoResult?.annotationResults?.[0]?.personDetectionAnnotations?.length,
          hasTextDetection: !!videoResult?.annotationResults?.[0]?.textAnnotations?.length
        })
      );
    } else {
      console.error('Video analysis failed:', videoAnalysisResult.reason);
      console.error('Error details:', JSON.stringify(videoAnalysisResult));
    }

    // Process audio transcription results
    let audioResult = { hasAudio: false, transcript: '', confidence: 0, speakerCount: 0 };
    if (audioTranscriptionResult.status === 'fulfilled') {
      audioResult = audioTranscriptionResult.value;
    } else {
      console.error('Audio transcription failed:', audioTranscriptionResult.reason);
    }

    // Combine results, prioritizing dedicated audio transcription
    const combinedSpeechTranscription = audioResult.hasAudio 
      ? audioResult 
      : processSpeechTranscription(videoResult?.annotationResults?.[0]?.speechTranscriptions || []);

    // Process and structure the results
    const analysisResults = {
      videoAnalysis: {
        duration: videoResult?.annotationResults?.[0]?.inputUri ? 'Available' : 'Unknown',
        faceDetection: processFaceDetection(videoResult?.annotationResults?.[0]?.faceDetectionAnnotations || []),
        speechTranscription: combinedSpeechTranscription,
        personDetection: processPersonDetection(videoResult?.annotationResults?.[0]?.personDetectionAnnotations || []),
        textDetection: processTextDetection(videoResult?.annotationResults?.[0]?.textAnnotations || []),
        confidence: calculateOverallConfidence(videoResult?.annotationResults?.[0]),
        timestamp: new Date().toISOString(),
        audioProcessingMethod: audioResult.hasAudio ? 'dedicated-speech-api' : 'video-intelligence-api'
      }
    };

    return analysisResults;
  } catch (error) {
    console.error('Video analysis error:', error);
    throw new Error(`Video analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper functions to process analysis results
function processFaceDetection(faceAnnotations: any[]) {
  if (!faceAnnotations.length) return { detected: false, count: 0 };
  
  const faces = faceAnnotations.map(annotation => ({
    confidence: annotation.tracks?.[0]?.confidence || 0,
    emotions: annotation.tracks?.[0]?.timestampedObjects?.[0]?.attributes || [],
    duration: annotation.tracks?.[0]?.segment || {}
  }));

  return {
    detected: true,
    count: faces.length,
    averageConfidence: faces.reduce((sum, face) => sum + face.confidence, 0) / faces.length,
    faces: faces.slice(0, 5) // Limit to first 5 faces
  };
}

function processSpeechTranscription(speechAnnotations: any[]) {
  if (!speechAnnotations.length) return { hasAudio: false, transcript: '' };

  const transcripts = speechAnnotations.map(annotation => 
    annotation.alternatives?.[0]?.transcript || ''
  ).filter(Boolean);

  return {
    hasAudio: true,
    transcript: transcripts.join(' '),
    confidence: speechAnnotations[0]?.alternatives?.[0]?.confidence || 0,
    speakerCount: speechAnnotations.length
  };
}

function processPersonDetection(personAnnotations: any[]) {
  if (!personAnnotations.length) return { detected: false, count: 0 };

  return {
    detected: true,
    count: personAnnotations.length,
    confidence: personAnnotations[0]?.tracks?.[0]?.confidence || 0
  };
}

function processTextDetection(textAnnotations: any[]) {
  if (!textAnnotations.length) return { detected: false, text: '' };

  const detectedText = textAnnotations.map(annotation => 
    annotation.text || ''
  ).filter(Boolean).join(' ');

  return {
    detected: true,
    text: detectedText,
    confidence: textAnnotations[0]?.confidence || 0
  };
}

function calculateOverallConfidence(annotationResult: any) {
  const confidences = [];
  
  if (annotationResult?.faceDetectionAnnotations?.length) {
    confidences.push(annotationResult.faceDetectionAnnotations[0]?.tracks?.[0]?.confidence || 0);
  }
  
  if (annotationResult?.speechTranscriptions?.length) {
    confidences.push(annotationResult.speechTranscriptions[0]?.alternatives?.[0]?.confidence || 0);
  }
  
  if (annotationResult?.personDetectionAnnotations?.length) {
    confidences.push(annotationResult.personDetectionAnnotations[0]?.tracks?.[0]?.confidence || 0);
  }

  return confidences.length > 0 ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length : 0;
}

export async function POST(request: NextRequest) {
  const requestId = `va-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  console.log(`✨ [${requestId}] VIDEO ANALYSIS API CALLED ✨`);
  
  try {
    // Log request details
    const url = new URL(request.url);
    const cookies = Object.fromEntries(
      Array.from(request.cookies.getAll()).map(c => [c.name, c.value ? 'present' : 'empty'])
    );
    
    console.log(`💬 [${requestId}] Request details:`, {
      method: request.method,
      path: url.pathname,
      headers: {
        'content-type': request.headers.get('content-type'),
        'x-auth-method': request.headers.get('x-auth-method'),
        'authorization': request.headers.get('authorization') ? 'present' : 'absent',
        'cookie': request.headers.get('cookie') ? 'present' : 'absent',
      },
      cookies: cookies
    });
    
    // Check authentication - Support both JWT and database sessions
    console.log(`🔑 [${requestId}] Checking authentication...`);
    const session = await getServerSession(authOptions);
    const jwtToken = await getToken({ req: request });
    const authMethod = request.headers.get('X-Auth-Method');
    const authHeader = request.headers.get('Authorization');
    
    // Log authentication attempt details for debugging
    console.log(`🔑 [${requestId}] Auth method requested:`, authMethod);
    console.log(`🔑 [${requestId}] Authorization header present:`, !!authHeader);
    console.log(`🔑 [${requestId}] Session present:`, !!session);
    console.log(`🔑 [${requestId}] JWT token present:`, !!jwtToken);
    
    if (session) {
      console.log(`🔑 [${requestId}] Session user:`, session.user?.email);
      console.log(`🔑 [${requestId}] Session expiry:`, session.expires);
      console.log(`🔑 [${requestId}] Session user ID:`, session.user?.id);
    }
    
    if (jwtToken) {
      console.log(`🔑 [${requestId}] JWT token user:`, jwtToken.email);
      console.log(`🔑 [${requestId}] JWT token subject:`, jwtToken.sub);
      console.log(`🔑 [${requestId}] JWT token expiry:`, jwtToken.exp ? new Date(Number(jwtToken.exp) * 1000).toISOString() : 'unknown');
    }
    
    // Only authenticated sessions are allowed
    let isAuthenticated = false;
    let userId = null;
    let authenticationMethod = 'none';
    
    // Check JWT token first (primary auth method)
    if (jwtToken) {
      isAuthenticated = true;
      userId = jwtToken.userId as string || jwtToken.sub;
      authenticationMethod = 'jwt';
      console.log(`✅ [${requestId}] Authenticated via JWT token for user ID:`, userId);
    }
    // Then check session (fallback)
    else if (session) {
      isAuthenticated = true;
      userId = session.user?.id;
      authenticationMethod = 'session';
      console.log(`✅ [${requestId}] Authenticated via session for user:`, session.user?.email);
    }
    // Finally check database session directly if session cookie is present
    else {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value;
        if (sessionToken) {
          console.log(`🔑 [${requestId}] Found database-specific session token`);
        }
      }
      
      if (sessionToken) {
        console.log(`🔑 [${requestId}] Checking database session with token`);
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          });
          
          if (dbSession && dbSession.expires > new Date()) {
            isAuthenticated = true;
            userId = dbSession.userId;
            authenticationMethod = 'database';
            console.log(`✅ [${requestId}] Authenticated via database session for user ID:`, userId);
          } else {
            console.log(`❌ [${requestId}] Database session invalid or expired:`, {
              found: !!dbSession,
              expires: dbSession?.expires,
              now: new Date(),
              isExpired: dbSession ? dbSession.expires < new Date() : 'N/A'
            });
          }
        } catch (error) {
          console.error(`❌ [${requestId}] Error checking database session:`, error);
        }
      } else {
        console.log(`❌ [${requestId}] No session token found in cookies`);
      }
    }
    
    // API key authentication as last resort for testing
    if (!isAuthenticated && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      try {
        const apiKey = process.env.API_KEY;
        const apiSecretKey = process.env.API_SECRET_KEY;
        const publicApiKey = process.env.NEXT_PUBLIC_API_SECRET_KEY;
        
        if ((apiKey && token === apiKey) || 
            (apiSecretKey && token === apiSecretKey) || 
            (publicApiKey && token === publicApiKey)) {
          isAuthenticated = true;
          authenticationMethod = 'api_key';
          console.log(`✅ [${requestId}] Authenticated via API key for testing`);
        } else {
          console.log(`❌ [${requestId}] Invalid API key provided`);
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Token validation error:`, error);
      }
    }
    
    if (!isAuthenticated) {
      console.log(`❌ [${requestId}] Authentication failed - no valid session or token`);
      return NextResponse.json({ 
        error: 'Unauthorized - Valid authentication required',
        requestId: requestId
      }, { status: 401 });
    }

    const body = await request.json();
    const { videoUri, sessionId: originalSessionId, analysisType = 'comprehensive' } = body;

    if (!videoUri) {
      return NextResponse.json({ error: 'videoUri is required' }, { status: 400 });
    }

    // Extract the base sessionId and segmentIndex from the provided sessionId or from separate parameters
    let sessionId = originalSessionId;
    let segmentIndex: number = body.segmentIndex !== undefined ? Number(body.segmentIndex) : 0;

    // If segmentIndex wasn't explicitly provided but sessionId contains an underscore-separated index
    if (segmentIndex === 0 && originalSessionId && originalSessionId.includes('_')) {
      const parts = originalSessionId.split('_');
      sessionId = parts[0];
      const parsedIndex = parseInt(parts[1], 10);
      if (!isNaN(parsedIndex)) {
        segmentIndex = parsedIndex;
        console.log(`[${requestId}] Parsed segment index ${segmentIndex} from sessionId ${originalSessionId}`);
      } else {
        console.warn(`[${requestId}] Could not parse segment index from ${originalSessionId}, using provided or default index: ${segmentIndex}`);
      }
    }

    console.log(`📹 [${requestId}] Starting video analysis for:`, videoUri);
    console.log(`📹 [${requestId}] Analysis type:`, analysisType);
    console.log(`📹 [${requestId}] Session ID:`, sessionId || 'not provided');
    console.log(`📹 [${requestId}] Segment Index:`, segmentIndex);
    console.log(`📹 [${requestId}] Authentication method:`, authenticationMethod);
    
    // Additional request details
    const retryAttempt = body.retryAttempt || 0;
    const isDirectApiKeyFallback = body.isDirectApiKeyFallback || false;
    
    if (retryAttempt > 0) {
      console.log(`🔄 [${requestId}] This is retry attempt #${retryAttempt}`);
    }
    
    if (isDirectApiKeyFallback) {
      console.log(`🔄 [${requestId}] This is a direct API key fallback call`);
    }

    // Perform comprehensive video analysis using Google Cloud Video Intelligence API
    console.log(`📹 [${requestId}] Calling Video Intelligence API...`);
    const startTime = Date.now();
    let analysisResult;
    
    try {
      analysisResult = await performVideoAnalysis(videoUri, analysisType);
      const duration = (Date.now() - startTime) / 1000;
      console.log(`✅ [${requestId}] Video analysis completed successfully in ${duration.toFixed(2)}s`);
    } catch (analysisError: unknown) {
      const duration = (Date.now() - startTime) / 1000;
      console.error(`❌ [${requestId}] Video analysis failed after ${duration.toFixed(2)}s:`, analysisError);
      
      // Detailed error logging
      if (analysisError instanceof Error) {
        console.error(`❌ [${requestId}] Analysis error details:`, {
          name: analysisError.name,
          message: analysisError.message,
          stack: analysisError.stack
        });
      }
      
      throw analysisError; // Re-throw to be caught by outer try/catch
    }

    // Store analysis result in database
    if (sessionId) {
      try {
        // Try to get userId from session or request body
        let userId: string | undefined;
        if (session?.user?.id) {
          userId = session.user.id;
          console.log(`💾 [${requestId}] Found user ID from session:`, userId);
        } else if (body.userId) {
          userId = body.userId as string;
          console.log(`💾 [${requestId}] Found user ID from request body:`, userId);
        } else {
          // Try to get userId from the interview session record
          const sessionRecord = await prisma.interviewSession.findUnique({
            where: { id: sessionId },
            select: { intervieweeId: true }
          });
          userId = sessionRecord?.intervieweeId;
          console.log(`💾 [${requestId}] Found user ID from session record:`, userId || 'not found');
        }
        
        if (userId) {
          console.log(`💾 [${requestId}] Storing analysis results in database...`);
          
          const dbStartTime = Date.now();
          
          try {
            // Use a transaction to ensure atomicity
            await prisma.$transaction(async (tx) => {
              // First try to find an existing analysis for this session and segment using raw query
              const existingAnalysisArray = await tx.$queryRaw<Array<{id: string}>>`
                SELECT id FROM video_analysis 
                WHERE "sessionId" = ${sessionId} AND "segmentIndex" = ${segmentIndex}
                LIMIT 1
              `;
              
              if (existingAnalysisArray && existingAnalysisArray.length > 0) {
                // Update existing analysis using raw query
                await tx.$executeRaw`
                  UPDATE video_analysis 
                  SET results = ${JSON.stringify(analysisResult)}, "updatedAt" = ${new Date()} 
                  WHERE id = ${existingAnalysisArray[0].id}
                `;
                console.log(`💾 [${requestId}] Updated existing analysis record with ID: ${existingAnalysisArray[0].id}`);
              } else {
                // Create new analysis using raw query
                await tx.$executeRaw`
                  INSERT INTO video_analysis (id, "sessionId", "segmentIndex", "userId", results, "createdAt", "updatedAt")
                  VALUES (${crypto.randomUUID()}, ${sessionId}, ${segmentIndex}, ${userId}, ${JSON.stringify(analysisResult)}, ${new Date()}, ${new Date()})
                `;
                console.log(`💾 [${requestId}] Created new analysis record for session ${sessionId}, segment ${segmentIndex}`);
              }
            });
            
            const dbDuration = (Date.now() - dbStartTime) / 1000;
            console.log(`✅ [${requestId}] Analysis results stored successfully in ${dbDuration.toFixed(2)}s for session: ${sessionId}, segment: ${segmentIndex}, user: ${userId}`);
          } catch (txError: unknown) {
            console.error(`❌ [${requestId}] Transaction error:`, txError);
            throw txError;
          }
        } else {
          console.log(`❌ [${requestId}] Could not determine user ID for session: ${sessionId}`);
        }
      } catch (dbError: unknown) {
        console.error(`❌ [${requestId}] Failed to store analysis results:`, dbError);
        // Log detailed error info
        if (dbError instanceof Error) {
          console.error(`❌ [${requestId}] Database error details:`, {
            name: dbError.name,
            message: dbError.message,
            stack: dbError.stack
          });
        }
        // Continue execution - don't fail the request if DB storage fails
      }
    }

    console.log(`✅ [${requestId}] Video analysis API call completed successfully`);
    return NextResponse.json({
      ...analysisResult,
      requestId,
      processingInfo: {
        timestamp: new Date().toISOString(),
        authMethod: authenticationMethod || 'none',
        sessionId: sessionId || null,
        retryAttempt: retryAttempt || 0
      }
    });
  } catch (error: unknown) {
    console.error(`❌ [${requestId}] Video analysis API error:`, error);
    
    // Detailed error logging
    if (error instanceof Error) {
      console.error(`❌ [${requestId}] Error details:`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return NextResponse.json(
      { 
        error: 'Video analysis failed', 
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: requestId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Support both JWT and database sessions
    const session = await getServerSession(authOptions);
    const jwtToken = await getToken({ req: request });
    const authHeader = request.headers.get('Authorization');
    
    // Log authentication attempt details for debugging
    console.log('GET - Session present:', !!session);
    console.log('GET - JWT token present:', !!jwtToken);
    console.log('GET - Authorization header present:', !!authHeader);
    
    if (session) {
      console.log('GET - Session user:', session.user?.email);
      console.log('GET - Session expiry:', session.expires);
    }
    
    if (jwtToken) {
      console.log('GET - JWT token user:', jwtToken.email);
      console.log('GET - JWT token subject:', jwtToken.sub);
    }
    
    // Check authentication methods
    let isAuthenticated = false;
    let userId = null;
    
    // Check JWT token first (primary auth method)
    if (jwtToken) {
      isAuthenticated = true;
      userId = jwtToken.userId as string || jwtToken.sub;
      console.log('GET - Authenticated via JWT token for user ID:', userId);
    }
    // Then check session (fallback)
    else if (session) {
      isAuthenticated = true;
      userId = session.user?.id;
      console.log('GET - Authenticated via session for user:', session.user?.email);
    }
    // Finally check database session directly if session cookie is present
    else {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value;
        if (sessionToken) {
          console.log('GET - Found database-specific session token');
        }
      }
      
      if (sessionToken) {
        console.log('GET - Checking database session with token');
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          });
          
          if (dbSession && dbSession.expires > new Date()) {
            isAuthenticated = true;
            userId = dbSession.userId;
            console.log('GET - Authenticated via database session for user ID:', userId);
          } else {
            console.log('GET - Database session invalid or expired');
          }
        } catch (error) {
          console.error('GET - Error checking database session:', error);
        }
      }
    }
    
    // API key authentication as last resort for testing
    if (!isAuthenticated && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      try {
        const apiKey = process.env.API_KEY;
        const apiSecretKey = process.env.API_SECRET_KEY;
        
        if (token === apiKey || token === apiSecretKey) {
          isAuthenticated = true;
          console.log('GET - Authenticated via API key for testing');
        } else {
          console.log('GET - Invalid API key provided');
        }
      } catch (error) {
        console.error('GET - Token validation error:', error);
      }
    }
    
    if (!isAuthenticated) {
      console.log('GET - Authentication failed - no valid authentication');
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const analyses = await prisma.videoAnalysis.findMany({
      where: { 
        sessionId: sessionId,
        // If authenticated, ensure the user owns the analyses
        ...(userId && { userId: userId })
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!analyses || analyses.length === 0) {
      return NextResponse.json({ error: 'No analysis found for this session' }, { status: 404 });
    }

    // API key provides unrestricted access, otherwise ownership is checked in the query.
    return NextResponse.json(analyses);

  } catch (error: unknown) {
    console.error('Get analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
