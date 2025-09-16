import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SpeechClient, protos } from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
 
type WordTiming = {
  word: string;
  startTime: number;
  endTime: number;
};

// Initialize Speech-to-Text client via Application Default Credentials
const speechClient = new SpeechClient();

// Initialize Google Cloud Storage client via Application Default Credentials
const storage = new Storage();

// Get Google Cloud Storage bucket name from env or use default
const bucketName = process.env.GCS_BUCKET_NAME || 'interview-audio-analysis';

/**
 * Helper function to get authenticated user ID from various auth methods
 */
async function getAuthenticatedUserId(request: NextRequest): Promise<string | undefined> {
  // Check for API key in headers
  const apiKey = request.headers.get('x-api-key');
  if (apiKey && apiKey === process.env.API_SECRET_KEY) {
    console.log('[API] Authenticated via API key');
    // For testing via API key, we can use a test user ID
    // Usually we'd have an API key <-> user mapping in the database
    const testUserId = 'cmezbehpa000014evtcw8ab0p'; // Default test user
    return testUserId;
  }

  // Try to get user from JWT token first
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  
  // Then try to get user from session
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
 * Upload audio file to Google Cloud Storage
 */
async function uploadToGCS(audioBuffer: Buffer, fileName: string): Promise<string> {
  // Create bucket if it doesn't exist
  try {
    const [bucketExists] = await storage.bucket(bucketName).exists();
    if (!bucketExists) {
      console.log(`[API] Bucket ${bucketName} does not exist, creating...`);
      await storage.createBucket(bucketName);
    }
  } catch (error) {
    console.error(`[API] Error checking/creating bucket:`, error);
    throw error;
  }
  
  // Get reference to bucket and file
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(fileName);
  
  // Upload audio buffer to GCS (force simple upload to avoid AbortSignal/resumable issues)
  try {
    await file.save(audioBuffer, {
      resumable: false,
      validation: false,
      contentType: 'audio/webm',
      metadata: {
        cacheControl: 'private, max-age=0',
      }
    });
    
    console.log(`[API] Uploaded audio file to gs://${bucketName}/${fileName}`);
    return `gs://${bucketName}/${fileName}`;
  } catch (uploadError) {
    console.error(`[API] Error uploading to GCS:`, uploadError);
    throw uploadError;
  }
}

/**
 * API route handler for post-interview speech analysis
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/speech-analysis - Starting analysis');
    
    // Auth check
    const userId = await getAuthenticatedUserId(request);
    
    if (!userId) {
      console.error('[API] Unauthorized speech-analysis request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for speech-analysis: ${userId}`);

    // Parse the FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const interviewId = formData.get('interviewId') as string;
    
    if (!audioFile || !interviewId) {
      return NextResponse.json({ error: 'Audio file and interviewId required' }, { status: 400 });
    }
    
    // Process the audio file
    const audioArrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);
    const fileSize = audioBuffer.length;
    
    console.log(`[API] Received audio file for analysis (${Math.round(fileSize / 1024 / 1024 * 10) / 10} MB)`);
    
    // Generate a unique filename
    const timestamp = Date.now();
    const fileName = `interview-${interviewId}-${userId}-${timestamp}.webm`;
    
    // Start a job to record the analysis request
    try {
      await (prisma as any).speechAnalysisJob.create({
        data: {
          interviewId,
          userId,
          status: 'QUEUED',
          filename: fileName,
          fileSize,
          startTime: new Date(),
        }
      });
    } catch (dbError) {
      console.error('[API] Error recording analysis job in database:', dbError);
      // Continue processing even if DB record fails
    }

    // Upload the audio file to GCS
    let gcsUri: string;
    try {
      console.log('[API] Uploading audio to Google Cloud Storage...');
      gcsUri = await uploadToGCS(audioBuffer, fileName);
    } catch (uploadError) {
      return NextResponse.json({ 
        error: 'Failed to upload audio', 
        details: uploadError instanceof Error ? uploadError.message : 'Unknown error' 
      }, { status: 500 });
    }
    
    // Configure speech recognition with the GCS URI
    const recognitionConfig = {
      config: {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        useEnhanced: true,
        enableWordTimeOffsets: true,
        maxAlternatives: 1,
        profanityFilter: false,
        enableSpeakerDiarization: false,
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
      },
      audio: { uri: gcsUri },
    };

    // Start long-running recognition operation
    console.log('[API] Starting LongRunningRecognize operation...');
    const [operation] = await speechClient.longRunningRecognize(recognitionConfig);
    const operationName = operation.name;
    
    // Update job status in the database
    try {
      await (prisma as any).speechAnalysisJob.updateMany({
        where: { 
          userId,
          interviewId,
          filename: fileName,
        },
        data: {
          status: 'PROCESSING',
          operationName,
        }
      });
    } catch (updateError) {
      console.error('[API] Error updating analysis job status:', updateError);
      // Continue processing even if DB update fails
    }

    console.log(`[API] Speech analysis job started, operation name: ${operationName}`);
    
    return NextResponse.json({
      success: true,
      message: 'Speech analysis job started',
      operationName,
      jobId: `${interviewId}-${timestamp}`,
      estimatedCompletionSeconds: Math.ceil(fileSize / 1024 / 1024 * 2), // Rough estimate: ~2 sec per MB
    });

  } catch (error) {
    console.error('[API] Speech analysis error:', error);
    return NextResponse.json(
      { error: 'Speech analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * API route to check the status of a long-running speech analysis job
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthenticatedUserId(request);
  
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const operationName = url.searchParams.get('operationName');
  const jobId = url.searchParams.get('jobId');
  
  if (!operationName && !jobId) {
    return NextResponse.json({ error: 'Either operationName or jobId required' }, { status: 400 });
  }
  
  let job;
  
  // If we have a jobId, look up the operation in the database
  if (jobId) {
    job = await (prisma as any).speechAnalysisJob.findFirst({
      where: {
        userId,
        interviewId: jobId.split('-')[0], // Split to get the interview ID part
      },
      orderBy: {
        startTime: 'desc',
      },
    });
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
  }
  
  // Use the operation name from the job record or the query parameter
  const opName = job?.operationName || operationName;
  if (!opName) {
    return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
  }
  
  try {
    // Check the operation status with proper error handling
    let operation;
    try {
      console.log(`[API] Checking status for operation ${opName}`);
      operation = await speechClient.checkLongRunningRecognizeProgress(opName);
      
      // Operation is typed as LROperation<LongRunningRecognizeResponse, LongRunningRecognizeMetadata>
      const done = operation?.done ?? false;
      const metadata = operation?.metadata as any || {};
      const progressPercent = metadata?.progressPercent ?? 0;
      
      // If complete, get the results
      if (done) {
        console.log(`[API] Operation ${opName} is complete`);
        
        try {
          // Get the result from the operation
          const [response] = await speechClient.longRunningRecognize({ name: opName } as any);
          
          // Process results
          let fullTranscript = '';
          const wordTimings: WordTiming[] = [];
          let confidence = 0;
          let wordCount = 0;
          
          // Cast response to proper type
          const responseData = response as unknown as protos.google.cloud.speech.v1.ILongRunningRecognizeResponse;
          
          if (responseData?.results && responseData.results.length > 0) {
            responseData.results.forEach((result: any) => {
              if (result.alternatives && result.alternatives.length > 0) {
                const alternative = result.alternatives[0];
                fullTranscript += alternative.transcript + ' ';
                
                if (alternative.confidence) {
                  confidence += alternative.confidence;
                  wordCount++;
                }
                
                // Extract word timing information
                if (alternative.words) {
                  alternative.words.forEach((word: any) => {
                    wordTimings.push({
                      word: word.word,
                      startTime: word.startTime?.seconds || 0,
                      endTime: word.endTime?.seconds || 0,
                    });
                  });
                }
              }
            });
            
            fullTranscript = fullTranscript.trim();
            confidence = wordCount > 0 ? confidence / wordCount : 0;
          }
          
          // Update job in database if we have a job record
          if (job) {
            await (prisma as any).speechAnalysisJob.update({
              where: { id: job.id },
              data: {
                status: 'COMPLETED',
                transcript: fullTranscript,
                confidence,
                completionTime: new Date(),
              }
            });
          }
          
          return NextResponse.json({
            status: 'COMPLETED',
            transcript: fullTranscript,
            confidence,
            wordCount: wordTimings.length,
            wordTimings: wordTimings.length > 0 ? wordTimings : undefined,
          });
        } catch (resultError: unknown) {
          console.error(`[API] Error getting results for operation ${opName}:`, resultError);
          
          // Update job status if we have a job record
          if (job) {
            await (prisma as any).speechAnalysisJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                errorMessage: resultError instanceof Error ? resultError.message : 'Unknown error',
                completionTime: new Date(),
              }
            });
          }
          
          return NextResponse.json({
            error: 'Failed to get speech analysis results',
            details: resultError instanceof Error ? resultError.message : 'Unknown error',
          }, { status: 500 });
        }
      } else {
        // Operation is still in progress
        return NextResponse.json({
          status: 'PROCESSING',
          progress: progressPercent,
          done: false,
          operationName: opName,
          jobId: job?.id,
        });
      }
    } catch (permError: unknown) {
      // Handle Google Cloud Speech API permission issues
      console.error(`[API] Permission error checking operation ${opName}:`, permError);
      
      // Update the job status to failed
      try {
        if (job) {
          await (prisma as any).speechAnalysisJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              errorMessage: `Permission denied: ${permError instanceof Error ? permError.message : 'Unknown error'}`
            }
          });
        }
      } catch (dbError) {
        console.error(`[API] Failed to update job status for ${job?.id}:`, dbError);
      }
      
      return NextResponse.json({
        status: 'FAILED',
        error: 'Permission error',
        details: `The application doesn't have permission to access the Speech API operation. Please check your Google Cloud credentials and permissions.`,
        jobId: job?.id,
      }, { status: 403 });
    }
  } catch (error: unknown) {
    // Catch-all error handler
    console.error(`[API] Error checking status for operation ${opName}:`, error);
    return NextResponse.json({
      error: 'Failed to check analysis status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
