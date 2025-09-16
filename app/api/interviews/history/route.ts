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
        let analysisData: any = null;
        let hasVideoAnalysis = false;

        // Check if this session has video analysis
        const videoAnalysis = await prisma.videoAnalysis.findFirst({
          where: { sessionId: sessionData.id },
          orderBy: { createdAt: 'desc' }
        });

        // Session duration in seconds (used for WPM)
        const durationSec = sessionData.endedAt && sessionData.startedAt
          ? Math.floor((sessionData.endedAt.getTime() - sessionData.startedAt.getTime()) / 1000)
          : sessionData.duration ? sessionData.duration * 60 : null;

        let parsedVA: any = null;
        if (videoAnalysis) {
          hasVideoAnalysis = true;
          try {
            parsedVA = JSON.parse((videoAnalysis as any).results);
          } catch (e) {
            console.error('Error parsing analysis data:', e);
          }
        }

        // Build a normalized structure expected by history page if possible
        const normalized: any = {};
        try {
          const va = parsedVA?.videoAnalysis || parsedVA?.video_analysis || null;
          const transcript: string = va?.speechTranscription?.transcript || '';
          const wordCount: number = va?.speechTranscription?.wordCount || (typeof transcript === 'string' ? (transcript.trim().match(/\S+/g)?.length || 0) : 0);
          let avgPace: number | null = null;
          if (wordCount && durationSec && durationSec > 0) {
            avgPace = Math.round(wordCount / (durationSec / 60));
          }

          if (transcript || avgPace != null) {
            normalized.speech_analysis = normalized.speech_analysis || {};
            if (transcript) normalized.speech_analysis.transcript = transcript;
            normalized.speech_analysis.pace_analysis = { average_pace: avgPace != null ? avgPace : undefined };
            // filler_words will be filled from feedback if available; fallback heuristic below
          }

          if (typeof va?.confidence === 'number') {
            normalized.confidence_analysis = { confidence_score: va.confidence };
          }
        } catch (e) {
          console.warn('Failed to build normalized VA data:', e);
        }

        // Merge conversational numeric feedback (if exists) for overall score, clarity, filler, pace
        try {
          const feedback = await (prisma as any).interviewFeedback.findUnique({
            where: { sessionId: sessionData.id },
            select: { contentFeedback: true, clarityScore: true, speakingPaceWpm: true, fillerWordCount: true }
          });
          if (feedback) {
            let cf: any = null;
            try {
              cf = typeof feedback.contentFeedback === 'string' ? JSON.parse(feedback.contentFeedback) : feedback.contentFeedback;
            } catch {}

            const overall10 = typeof cf?.overallPerformance10 === 'number' ? cf.overallPerformance10 : null;
            if (overall10 != null) {
              normalized.analysis = { overallScore: Math.round(overall10 * 10) };
            }

            // Map clarity (store as 0-100)
            const clarity = typeof feedback.clarityScore === 'number' ? feedback.clarityScore : (typeof cf?.clarityOfThought10 === 'number' ? Math.round(cf.clarityOfThought10 * 10) : null);
            if (clarity != null) {
              normalized.speech_analysis = normalized.speech_analysis || {};
              normalized.speech_analysis.clarity_score = clarity;
            }

            // Prefer stored speaking pace and filler counts if present
            if (typeof feedback.speakingPaceWpm === 'number') {
              normalized.speech_analysis = normalized.speech_analysis || {};
              normalized.speech_analysis.pace_analysis = { average_pace: Math.round(feedback.speakingPaceWpm) };
            }
            if (typeof feedback.fillerWordCount === 'number') {
              normalized.speech_analysis = normalized.speech_analysis || {};
              normalized.speech_analysis.filler_words = { total_count: feedback.fillerWordCount };
            }
          }
        } catch (e) {
          console.warn('Failed to merge interview feedback:', e);
        }

        // Fallback heuristic for filler words if still missing
        try {
          if (!normalized?.speech_analysis?.filler_words?.total_count) {
            const t = normalized?.speech_analysis?.transcript || '';
            if (t) {
              const fillers = ['um', 'uh', 'like', 'you know', 'i mean', 'so', 'actually', 'basically', 'right', 'ok', 'okay', 'well'];
              const lc = t.toLowerCase();
              let count = 0;
              for (const f of fillers) {
                const re = new RegExp(`(^|\\s)${f.replace(/[-/\\^$*+?.()|[\]{}]/g, r => `\\${r}`)}(\\s|$)`, 'g');
                count += (lc.match(re) || []).length;
              }
              normalized.speech_analysis = normalized.speech_analysis || {};
              normalized.speech_analysis.filler_words = { total_count: count };
            }
          }
        } catch {}

        // Compose final analysisData: prefer normalized fields but keep original parsed VA blob
        analysisData = parsedVA ? { ...normalized, ...parsedVA } : normalized;

        return {
          id: sessionData.id,
          createdAt: sessionData.createdAt.toISOString(),
          type: sessionData.type,
          status: sessionData.status,
          duration: durationSec,
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
