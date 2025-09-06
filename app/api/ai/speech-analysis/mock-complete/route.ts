import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getToken } from 'next-auth/jwt';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Helper function to get authenticated user ID from various auth methods
 */
async function getAuthenticatedUserId(request: NextRequest): Promise<string | undefined> {
  // Try to get user from JWT token first
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  
  // Then try to get user from session
  const session = await getServerSession(authOptions);
  
  // Get user ID from either JWT token or session
  let userId = token?.sub || session?.user?.id;
  
  // If no JWT or session, check for database session directly
  if (!userId) {
    // Check standard session token first
    let sessionToken = request.cookies.get('next-auth.session-token')?.value;
    
    // If not found, check for database-specific session token
    if (!sessionToken) {
      sessionToken = request.cookies.get('next-auth.database-session')?.value;
    }
    
    if (sessionToken) {
      try {
        const dbSession = await prisma.session.findUnique({
          where: { sessionToken },
          include: { user: true },
        });
        
        if (dbSession && dbSession.expires > new Date()) {
          userId = dbSession.userId;
        }
      } catch (error) {
        console.error('[MOCK API] Error checking database session:', error);
      }
    }
  }
  
  return userId;
}

/**
 * Mock completion handler for speech analysis testing
 * This endpoint allows testing the workflow without requiring actual Google Cloud Speech API permissions
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[MOCK API] Handling mock completion for speech analysis');
    
    // Auth check
    const userId = await getAuthenticatedUserId(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request body
    const requestData = await request.json();
    const { operationName, jobId, transcript, confidence } = requestData;
    
    if (!operationName || !jobId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    console.log(`[MOCK API] Processing mock completion for operation: ${operationName}, job: ${jobId}`);
    
    // Extract interviewId from jobId (format: interviewId-timestamp)
    const interviewId = jobId.split('-')[0];
    
    // Find the job in the database
    const job = await (prisma as any).speechAnalysisJob.findFirst({
      where: {
        userId,
        interviewId,
        operationName,
      }
    });
    
    if (!job) {
      console.log('[MOCK API] Job not found, creating a mock record');
      
      // Create a new mock job record
      await (prisma as any).speechAnalysisJob.create({
        data: {
          userId,
          interviewId,
          operationName,
          status: 'COMPLETED',
          filename: `mock-${jobId}.webm`,
          fileSize: 1024,
          transcript: transcript || 'Mock transcript for testing',
          confidence: confidence || 0.9,
          startTime: new Date(Date.now() - 5000), // 5 seconds ago
          completionTime: new Date(),
          createdAt: new Date(Date.now() - 5000),
          updatedAt: new Date(),
        }
      });
      
      return NextResponse.json({
        success: true,
        message: 'Created mock speech analysis record',
        jobId,
      });
    }
    
    // Update existing job with mock results
    await (prisma as any).speechAnalysisJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        transcript: transcript || 'Mock transcript for testing',
        confidence: confidence || 0.9,
        completionTime: new Date(),
        updatedAt: new Date(),
      }
    });
    
    console.log(`[MOCK API] Updated job ${job.id} with mock results`);
    
    return NextResponse.json({
      success: true,
      message: 'Updated job with mock results',
      jobId: job.id,
    });
    
  } catch (error) {
    console.error('[MOCK API] Error in mock completion handler:', error);
    return NextResponse.json({
      error: 'Mock completion failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
