import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SpeechClient } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize clients
const speechClient = new SpeechClient({ projectId: 'wingman-interview-470419' });
const storage = new Storage({ projectId: 'wingman-interview-470419' });
const bucketName = process.env.NEXT_PUBLIC_GCS_BUCKET_NAME || 'wingman-interview-videos-harshit-2024';

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/speech-stream - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
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
    
    if (!userId) {
      console.error('[API] Unauthorized speech-stream request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for speech-stream: ${userId}`);

    // Check if request is FormData or JSON
    const contentType = request.headers.get('content-type');
    let audioBuffer: Buffer;
    let sessionId: string;
    let enableDiarization = true;

    if (contentType?.includes('multipart/form-data')) {
      // Handle FormData from video blob
      const formData = await request.formData();
      const audioFile = formData.get('audio') as File;
      sessionId = formData.get('sessionId') as string;
      enableDiarization = formData.get('enableDiarization') === 'true';

      if (!audioFile) {
        return NextResponse.json({ error: 'Audio file required' }, { status: 400 });
      }

      // Convert File to Buffer
      const arrayBuffer = await audioFile.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      // Handle JSON with base64 audio data
      const body = await request.json();
      const { audioData } = body;
      sessionId = body.sessionId;
      enableDiarization = body.enableDiarization ?? true;

      if (!audioData) {
        return NextResponse.json({ error: 'Audio data required' }, { status: 400 });
      }

      // Convert base64 audio to buffer
      audioBuffer = Buffer.from(audioData, 'base64');
    }

    // Configure speech recognition - simplified for better compatibility
    const config = {
      encoding: 'WEBM_OPUS' as const,
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      model: 'video',
      useEnhanced: true,
      // Disable complex features for better reliability
      enableWordTimeOffsets: false,
      diarizationConfig: undefined, // Disable diarization for now to avoid complexity
    };

    // Log audio info for debugging
    const audioSizeInMB = audioBuffer.length / (1024 * 1024);
    console.log(`Processing audio: ${audioSizeInMB.toFixed(2)}MB, ${audioBuffer.length} bytes`);

    // If audio is > 1 min (approx > 1MB), use long running recognition
    if (audioBuffer.length > 1000000) {
      console.log('Audio > 1MB, using long running recognition via GCS');
      const tempFileName = `temp-audio/${sessionId}-${Date.now()}.webm`;
      const file = storage.bucket(bucketName).file(tempFileName);

      // Upload to GCS
      await file.save(audioBuffer, {
        metadata: { contentType: 'audio/webm' },
      });

      const gcsUri = `gs://${bucketName}/${tempFileName}`;
      console.log(`Audio uploaded to ${gcsUri}`);

      const audio = { uri: gcsUri };

      const [operation] = await speechClient.longRunningRecognize({
        config,
        audio,
      });

      console.log('Waiting for long-running operation to complete...');
      const [response] = await operation.promise();
      console.log('Long-running operation finished.');

      // Clean up the temporary file
      try {
        await file.delete();
        console.log(`Deleted temporary file: ${gcsUri}`);
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${gcsUri}:`, cleanupError);
      }

      return NextResponse.json(processTranscriptionResponse(response, sessionId, enableDiarization));

    } else {
      console.log('Audio < 1MB, using synchronous recognition');
      const audio = { content: audioBuffer.toString('base64') };
      const [response] = await speechClient.recognize({ config, audio });
      return NextResponse.json(processTranscriptionResponse(response, sessionId, enableDiarization));
    }

  } catch (error) {
    console.error('[API] Speech-to-text streaming error:', error);
    return NextResponse.json(
      { error: 'Speech recognition failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function processTranscriptionResponse(response: any, sessionId: string, enableDiarization: boolean) {
  const transcripts: any[] = [];
  const speakerSegments: any[] = [];

  if (response.results) {
    for (const result of response.results) {
      const alternative = result.alternatives?.[0];
      if (alternative) {
        transcripts.push({
          text: alternative.transcript,
          confidence: alternative.confidence || 0,
          words: alternative.words?.map((word: any) => ({
            word: word.word,
            startTime: word.startTime?.seconds || 0,
            endTime: word.endTime?.seconds || 0,
            speakerTag: word.speakerTag || 0,
          })) || [],
        });

        if (enableDiarization && alternative.words && alternative.words.length > 0) {
          let currentSpeaker = alternative.words[0].speakerTag || 0;
          let segmentStart = alternative.words[0].startTime?.seconds || 0;
          let segmentText = '';

          for (const word of alternative.words) {
            if (word.speakerTag !== currentSpeaker) {
              if (segmentText.trim()) {
                speakerSegments.push({
                  speaker: currentSpeaker === 0 ? 'User' : 'AI',
                  text: segmentText.trim(),
                  startTime: segmentStart,
                  endTime: word.startTime?.seconds || 0,
                });
              }
              currentSpeaker = word.speakerTag || 0;
              segmentStart = word.startTime?.seconds || 0;
              segmentText = word.word || '';
            } else {
              segmentText += ` ${word.word || ''}`;
            }
          }

          if (segmentText.trim()) {
            const lastWord = alternative.words[alternative.words.length - 1];
            speakerSegments.push({
              speaker: currentSpeaker === 0 ? 'User' : 'AI',
              text: segmentText.trim(),
              startTime: segmentStart,
              endTime: lastWord.endTime?.seconds || 0,
            });
          }
        }
      }
    }
  }

  return {
    transcripts,
    speakerSegments: enableDiarization ? speakerSegments : [],
    sessionId,
    timestamp: new Date().toISOString(),
  };
}

// WebSocket-like streaming endpoint for real-time transcription
export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/ai/speech-stream - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
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
    
    if (!userId) {
      console.error('[API] Unauthorized speech-stream GET request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for speech-stream GET: ${userId}`);
    
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Set up Server-Sent Events for real-time streaming
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        const data = `data: ${JSON.stringify({ 
          type: 'connected', 
          sessionId,
          message: 'Speech streaming ready' 
        })}\n\n`;
        controller.enqueue(encoder.encode(data));
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[API] Speech-stream GET error:', error);
    return NextResponse.json(
      { error: 'Speech streaming setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
