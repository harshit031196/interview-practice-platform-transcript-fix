import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/analytics/overview - Checking authentication')
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions)
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value
      
      // If not found, check for database-specific session token (for hybrid fallback)
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value
        if (sessionToken) {
          console.log('[API] Found database-specific session token')
        }
      }
      
      if (sessionToken) {
        console.log('[API] Checking database session with token')
        try {
          const dbSession = await prisma.session.findUnique({
            where: { sessionToken },
            include: { user: true },
          })
          
          if (dbSession && dbSession.expires > new Date()) {
            userId = dbSession.userId
            console.log('[API] Authenticated via database session for user ID:', userId)
          } else {
            console.log('[API] Database session invalid or expired')
          }
        } catch (error) {
          console.error('[API] Error checking database session:', error)
        }
      }
    }
    
    if (!userId) {
      console.error('[API] Unauthorized analytics overview request - no valid session')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log(`[API] User authenticated for analytics overview: ${userId}`)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        intervieweeProfile: true,
        intervieweeSessions: {
          include: {
            report: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!user?.intervieweeProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    // Calculate readiness score trend
    const allSessions = user.intervieweeSessions;
    const completedSessionsWithReports = allSessions.filter(s => s.report && s.report.overall !== null);

    const averageScore = completedSessionsWithReports.length > 0 
      ? Math.round(completedSessionsWithReports.reduce((sum, s) => sum + (s.report?.overall || 0), 0) / completedSessionsWithReports.length)
      : 0;

    const readinessTrend = allSessions.slice(0, 10).map((session, index) => ({
      date: session.createdAt.toISOString(),
      score: session.report?.overall || 0,
      session: allSessions.length - index
    })).reverse();

    const latestSessionWithReport = completedSessionsWithReports[0];
    let latestFeedback = null;

    if (latestSessionWithReport) {
      const videoAnalysis = await prisma.videoAnalysis.findFirst({
        where: { sessionId: latestSessionWithReport.id },
        orderBy: { createdAt: 'desc' },
      });

      let analysisData = null;
      if (videoAnalysis?.results) {
        try {
          analysisData = JSON.parse(videoAnalysis.results);
        } catch (e) {
          console.error('Failed to parse video analysis results:', e);
        }
      }

      latestFeedback = {
        sessionId: latestSessionWithReport.id,
        date: latestSessionWithReport.createdAt.toISOString(),
        score: latestSessionWithReport.report?.overall || 0,
        grade: (latestSessionWithReport.report as any)?.grade || 'N/A',
        analysis: analysisData,
      };
    }

    // Calculate peer percentile (mock data based on current readiness score)
    const currentReadiness = averageScore;
    let percentile = 50; // Default
    if (currentReadiness >= 80) percentile = 85;
    else if (currentReadiness >= 70) percentile = 70;
    else if (currentReadiness >= 60) percentile = 55;
    else if (currentReadiness >= 50) percentile = 40;
    else percentile = 25;

    return NextResponse.json({
      readinessScore: currentReadiness,
      readinessTrend,
      peerPercentile: percentile,
      totalSessions: allSessions.length,
      completedSessions: completedSessionsWithReports.length,
      averageScore: averageScore,
      latestFeedback: latestFeedback
    });
  } catch (error) {
    console.error('[API] Analytics overview error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
