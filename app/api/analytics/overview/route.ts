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
      // Check session token (support secure and non-secure cookie names)
      let sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
        || request.cookies.get('next-auth.session-token')?.value
      
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
            report: true,
            feedback: true,
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Calculate readiness score using Report if present, otherwise derive from InterviewFeedback
    const allSessions = user.intervieweeSessions;

    // Helpers to parse overall from feedback payloads
    const looksLikeCsv = (s: string) => /\d\s*,\s*\d/.test(s)
    const extractNumbersNoPad = (s: string): number[] => {
      const nums = (s.match(/-?\d+(?:\.\d+)?/g) || [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n))
        .slice(0, 6)
        .map((n) => {
          if (n <= 1 && n >= 0) n = n * 10
          if (n > 10) n = n / 10
          n = Math.round(n)
          if (n < 0) n = 0
          if (n > 10) n = 10
          return n
        })
      return nums
    }

    const deriveScorePercent = (s: any): number | null => {
      // Prefer Report.overall (0..100)
      if (s?.report && typeof s.report.overall === 'number') {
        return Math.max(0, Math.min(100, Math.round(s.report.overall)))
      }
      // Try InterviewFeedback content
      const fb = s?.feedback
      if (fb && typeof fb.contentFeedback === 'string') {
        const raw = fb.contentFeedback
        // Try JSON first
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            const root: any = parsed as any
            const maybe: any = root.analysis ?? root.normalized ?? root
            let ov: any =
              maybe?.overallScore10 ??
              maybe?.overall_score_10 ??
              maybe?.overallScore ??
              maybe?.overall ??
              maybe?.score ??
              // Feedback-SQL numeric format
              root?.overallPerformance10
            
            if (typeof ov === 'number') {
              // Map 0..10 => 0..100; if value looks like 0..1 scale accordingly
              if (ov <= 1 && ov >= 0) ov = ov * 100
              else if (ov <= 10) ov = ov * 10
              return Math.max(0, Math.min(100, Math.round(ov)))
            }
          }
        } catch {}
        // Try CSV/numbers in text
        if (looksLikeCsv(raw)) {
          const values = extractNumbersNoPad(raw)
          if (values.length > 0) {
            return Math.max(0, Math.min(100, Math.round(values[0] * 10)))
          }
        }
      }
      // Fallback to clarityScore if available (interpret 0..1 or 0..100)
      if (fb && typeof fb.clarityScore === 'number') {
        let ov = fb.clarityScore
        if (ov <= 1 && ov >= 0) ov = ov * 100
        return Math.max(0, Math.min(100, Math.round(ov)))
      }
      return null
    }

    // Build normalized list with computed scores
    const withScores = allSessions.map((s, idx) => ({
      session: s,
      score: deriveScorePercent(s),
      index: idx,
    }))
    const completedWithScores = withScores.filter(x => typeof x.score === 'number')

    const averageScore = completedWithScores.length > 0
      ? Math.round(completedWithScores.reduce((sum, x) => sum + (x.score || 0), 0) / completedWithScores.length)
      : 0

    // Last three completed sessions with scores (sessions are already ordered desc by createdAt)
    const lastThreeCompleted = completedWithScores.slice(0, 3)
    const lastThreeCount = lastThreeCompleted.length
    const readinessLastThree = lastThreeCount === 3
      ? Math.round(lastThreeCompleted.reduce((sum, x) => sum + (x.score || 0), 0) / 3)
      : null

    const readinessTrend = allSessions.slice(0, 10).map((session, index) => ({
      date: session.createdAt.toISOString(),
      score: deriveScorePercent(session) || 0,
      session: allSessions.length - index
    })).reverse();

    // Sessions this calendar month (based on createdAt/endedAt regardless of status)
    const now = new Date();
    const sessionsThisMonth = allSessions.filter(s => {
      const d = s.endedAt ? new Date(s.endedAt) : new Date(s.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const firstScored = completedWithScores[0]?.session;
    let latestFeedback = null as any;

    if (firstScored) {
      const videoAnalysis = await prisma.videoAnalysis.findFirst({
        where: { sessionId: firstScored.id },
        orderBy: { createdAt: 'desc' },
      });

      let analysisData = null as any;
      if (videoAnalysis?.results) {
        try {
          analysisData = JSON.parse(videoAnalysis.results);
        } catch (e) {
          console.error('Failed to parse video analysis results:', e);
        }
      }

      // Prefer report grade if present; otherwise, map score to a grade bucket
      const scoreVal = completedWithScores[0]?.score || 0;
      const gradeFromScore = scoreVal >= 90 ? 'A+' : scoreVal >= 85 ? 'A' : scoreVal >= 80 ? 'A-' :
                             scoreVal >= 75 ? 'B+' : scoreVal >= 70 ? 'B' : scoreVal >= 65 ? 'B-' :
                             scoreVal >= 60 ? 'C+' : scoreVal >= 55 ? 'C' : scoreVal >= 50 ? 'C-' : 'D';

      latestFeedback = {
        sessionId: firstScored.id,
        date: firstScored.createdAt.toISOString(),
        score: scoreVal,
        grade: (firstScored as any)?.report?.grade || gradeFromScore,
        analysis: analysisData,
      };
    }

    // Calculate peer percentile based on actual distribution of last-three averages across interviewees
    let peerPercentileLastThree = null as number | null
    if (readinessLastThree != null) {
      // Fetch recent reports to build a peer distribution (cap to limit workload)
      const recentReports = await prisma.report.findMany({
        select: {
          overall: true,
          session: { select: { intervieweeId: true, createdAt: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5000
      })

      // Group by user, collect up to 3 latest overalls
      const byUser = new Map<string, number[]>()
      for (const r of recentReports) {
        const uid = r.session.intervieweeId
        if (!uid) continue
        if (!byUser.has(uid)) byUser.set(uid, [])
        const arr = byUser.get(uid)!
        if (arr.length < 3) {
          const val = typeof r.overall === 'number' ? r.overall : 0
          arr.push(val)
        }
      }

      // Compute averages for users with at least 3 entries
      const peerAverages: number[] = []
      byUser.forEach((arr) => {
        if (arr.length === 3) {
          const avg = Math.round((arr[0] + arr[1] + arr[2]) / 3)
          peerAverages.push(avg)
        }
      })

      if (peerAverages.length > 0) {
        peerAverages.sort((a, b) => a - b)
        const userScore = readinessLastThree as number

        // Binary search bounds for equals to compute mid-rank percentile
        const lowerBound = (arr: number[], target: number) => {
          let lo = 0, hi = arr.length
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (arr[mid] < target) lo = mid + 1; else hi = mid
          }
          return lo
        }
        const upperBound = (arr: number[], target: number) => {
          let lo = 0, hi = arr.length
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (arr[mid] <= target) lo = mid + 1; else hi = mid
          }
          return lo
        }

        const lo = lowerBound(peerAverages, userScore)
        const hi = upperBound(peerAverages, userScore)
        const lessCount = lo
        const equalCount = hi - lo
        const N = peerAverages.length
        const rank = (lessCount + equalCount / 2) / N
        peerPercentileLastThree = Math.max(0, Math.min(100, Math.round(rank * 100)))
      } else {
        peerPercentileLastThree = 50
      }
    }

    // Fallback percentile based on overall average if last-three not available
    let percentile = 50
    if (peerPercentileLastThree == null) {
      const currentReadiness = averageScore
      if (currentReadiness >= 80) percentile = 85
      else if (currentReadiness >= 70) percentile = 70
      else if (currentReadiness >= 60) percentile = 55
      else if (currentReadiness >= 50) percentile = 40
      else percentile = 25
    }

    return NextResponse.json({
      readinessScore: averageScore,
      readinessTrend,
      peerPercentile: peerPercentileLastThree ?? percentile,
      // For the Practice Sessions card
      totalSessions: allSessions.length,
      completedSessions: completedWithScores.length,
      averageScore: averageScore,
      latestFeedback: latestFeedback,
      // Added fields used by dashboard UI
      readinessLastThree,
      lastThreeCount,
      sessionsThisMonth,
      peerPercentileLastThree
    });
  } catch (error) {
    console.error('[API] Analytics overview error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
