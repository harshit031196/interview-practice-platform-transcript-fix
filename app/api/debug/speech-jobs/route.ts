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
        console.error('[DEBUG API] Error checking database session:', error);
      }
    }
  }
  
  return userId;
}

/**
 * Debug endpoint to query speech analysis jobs
 * This is only for development and testing purposes
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const userId = await getAuthenticatedUserId(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse query parameters
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    const interviewId = url.searchParams.get('interviewId');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    // Build query conditions
    const where: any = { userId };
    
    if (jobId) {
      // Extract interviewId from jobId format (interviewId-timestamp)
      const parts = jobId.split('-');
      if (parts.length > 1) {
        where.interviewId = parts[0];
      } else {
        where.id = jobId; // Try direct ID lookup if not in expected format
      }
    } else if (interviewId) {
      where.interviewId = interviewId;
    }
    
    if (status) {
      where.status = status;
    }
    
    // Query the database
    const jobs = await (prisma as any).speechAnalysisJob.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
    
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: 'No job found in database' });
    }
    
    return NextResponse.json(jobs);
    
  } catch (error) {
    console.error('[DEBUG API] Error querying speech jobs:', error);
    return NextResponse.json({
      error: 'Failed to query speech jobs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
