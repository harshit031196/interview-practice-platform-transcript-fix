import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/interviews/history - Checking authentication');
    
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
      console.error('[API] Unauthorized interview history request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for interview history: ${userId}`);

    // Test database connection first
    try {
      await prisma.$connect();
      console.log('Database connected successfully');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return NextResponse.json({ 
        error: 'Database connection failed',
        details: dbError instanceof Error ? dbError.message : 'Unknown database error'
      }, { status: 500 });
    }

    // Fetch user's interview sessions
    console.log('[API] Fetching sessions for user:', userId);
    const sessions = await prisma.interviewSession.findMany({
      where: {
        OR: [
          { intervieweeId: userId },
          { interviewerId: userId }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Keep only the latest 5 sessions and delete the rest for this user
    const keepSessions = sessions.slice(0, 5);
    const sessionsToDelete = sessions.slice(5);
    if (sessionsToDelete.length > 0) {
      const deleteIds = sessionsToDelete.map((s) => s.id);
      console.log(`[API] Pruning ${deleteIds.length} older sessions for user ${userId}`);
      try {
        await prisma.$transaction([
          prisma.visionAnalysisFrame.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.videoAnalysis.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.transcriptItem.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          // interviewFeedback is not in Prisma client types, so cast to any
          (prisma as any).interviewFeedback.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.speechAnalysisJob.deleteMany({ where: { interviewId: { in: deleteIds } } }),
          prisma.recording.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.report.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.booking.deleteMany({ where: { sessionId: { in: deleteIds } } }),
          prisma.interviewSession.deleteMany({
            where: {
              id: { in: deleteIds },
              OR: [
                { intervieweeId: userId },
                { interviewerId: userId }
              ]
            }
          })
        ]);
        console.log('[API] Pruning complete');
      } catch (pruneErr) {
        console.error('[API] Error pruning old sessions:', pruneErr);
      }
    }

    // Get video analysis results for remaining sessions (top 5)
    const sessionsWithAnalysis = await Promise.all(
      keepSessions.map(async (sessionData) => {
        let analysisData = null;
        let hasVideoAnalysis = false;

        // Check if this session has video analysis
        const videoAnalysis = await prisma.videoAnalysis.findFirst({
          where: {
            sessionId: sessionData.id
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        if (videoAnalysis) {
          hasVideoAnalysis = true;
          try {
            analysisData = JSON.parse(videoAnalysis.results);
          } catch (e) {
            console.error('Error parsing analysis data:', e);
          }
        }

        return {
          id: sessionData.id,
          createdAt: sessionData.createdAt.toISOString(),
          type: sessionData.type,
          status: sessionData.status,
          duration: sessionData.endedAt && sessionData.startedAt 
            ? Math.floor((sessionData.endedAt.getTime() - sessionData.startedAt.getTime()) / 1000)
            : sessionData.duration ? sessionData.duration * 60 : null, // Convert minutes to seconds
          hasVideoAnalysis,
          isConversational: sessionData.isConversational || false,
          interviewType: sessionData.interviewType,
          difficulty: sessionData.difficulty,
          analysisData
        };
      })
    );

    return NextResponse.json({
      sessions: sessionsWithAnalysis,
      total: keepSessions.length
    });

  } catch (error) {
    console.error('[API] Error fetching interview history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
