import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Get all interviews for the current user
export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/interviews - Checking authentication');
    
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
      
      // If not found, check for database-specific session token (for hybrid fallback test)
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
      console.error('[API] Unauthorized interviews request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for interviews: ${userId}`);

    const sessions = await prisma.interviewSession.findMany({
      where: {
        intervieweeId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const interviews = sessions.map((session: any) => ({
      id: session.id,
      type: session.type,
      interviewType: session.interviewType || 'General',
      difficulty: session.difficulty || 'Medium',
      duration: session.duration || 15,
      status: session.status,
      createdAt: session.createdAt,
      hasFeedback: false, // Will be updated when feedback system is fully integrated
      overallScore: null,
      speakingPaceWpm: null,
      fillerWordCount: null,
      clarityScore: null,
      emotionSummary: null,
      contentSummary: null,
    }));

    return NextResponse.json({ interviews });

  } catch (error) {
    console.error('[API] Error fetching interviews:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interviews', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
