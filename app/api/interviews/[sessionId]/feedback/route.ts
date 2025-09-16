import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get feedback for a specific interview session
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // Hybrid auth: JWT -> NextAuth session -> DB session token
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const authSession = await getServerSession(authOptions);
    let userId = token?.sub || authSession?.user?.id;

    if (!userId) {
      let sessionToken = request.cookies.get('__Secure-next-auth.session-token')?.value
        || request.cookies.get('next-auth.session-token')?.value;
      if (!sessionToken) {
        sessionToken = request.cookies.get('next-auth.database-session')?.value || undefined;
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
        } catch (e) {
          // fall through
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = params;
    const { searchParams } = new URL(request.url)
    const raw = (searchParams.get('raw') || '').toLowerCase()

    // Try to find feedback first (primary goal is to deliver feedback to UI)
    let feedback = await (prisma as any).interviewFeedback.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        transcript: true,
        contentFeedback: true,
        processingMetadata: true,
        clarityScore: true,
        speakingPaceWpm: true,
        fillerWordCount: true,
        updatedAt: true,
      }
    });

    // Determine if video analysis is present regardless of feedback
    let videoReady = false
    try {
      const va = await prisma.videoAnalysis.findFirst({ where: { sessionId } })
      videoReady = !!va
    } catch {}

    // If no feedback OR feedback has no transcript, attempt to backfill transcript from latest video analysis
    if (!feedback || !String(feedback.transcript || '').trim()) {
      try {
        const latestVA = await prisma.videoAnalysis.findFirst({
          where: { sessionId },
          orderBy: { createdAt: 'desc' },
          select: { results: true },
        })
        let transcriptCandidate: string | null = null
        if (latestVA?.results) {
          try {
            const src = latestVA.results as any
            const obj = typeof src === 'string' ? JSON.parse(src) : (typeof src === 'object' ? src : null)
            if (obj) {
              const va = (obj as any).videoAnalysis || (obj as any).video_analysis || null
              const t1 = va?.speechTranscription?.transcript
              const t2 = (obj as any)?.speech_analysis?.transcript
              if (typeof t1 === 'string' && t1.trim()) transcriptCandidate = t1.trim()
              else if (typeof t2 === 'string' && t2.trim()) transcriptCandidate = t2.trim()
              // Handle array-of-segments shape from earlier pipelines
              else if (Array.isArray(obj)) {
                for (const seg of obj) {
                  const s1 = seg?.analysisData?.videoAnalysis?.speechTranscription?.transcript
                  const s2 = seg?.results?.speech_analysis?.transcript
                  if (typeof s1 === 'string' && s1.trim()) { transcriptCandidate = s1.trim(); break }
                  if (typeof s2 === 'string' && s2.trim()) { transcriptCandidate = s2.trim(); break }
                }
              }
              // Handle camelCase speechAnalysis
              if (!transcriptCandidate) {
                const t3 = (obj as any)?.speechAnalysis?.transcript
                if (typeof t3 === 'string' && t3.trim()) transcriptCandidate = t3.trim()
              }
            }
          } catch {}
        }
        // Final fallback: reconstruct from TranscriptItem table if available
        if (!transcriptCandidate) {
          try {
            const items = await prisma.transcriptItem.findMany({
              where: { sessionId },
              orderBy: { t: 'asc' },
              select: { speaker: true, text: true },
            })
            if (items && items.length) {
              const lines: string[] = []
              let prevRole: string | null = null
              for (const it of items) {
                const role = (String(it.speaker) === 'AI') ? 'Interviewer' : 'Candidate'
                const text = String(it.text || '').trim()
                if (!text) continue
                if (lines.length > 0 && prevRole === role) {
                  lines[lines.length - 1] = lines[lines.length - 1] + ' ' + text
                } else {
                  lines.push(`${role}: ${text}`)
                }
                prevRole = role
              }
              const assembled = lines.join('\n').trim()
              if (assembled) transcriptCandidate = assembled
            }
          } catch {}
        }
        if (transcriptCandidate) {
          if (!feedback) {
            // Create minimal feedback row so transcript is persisted for history/chat UI
            feedback = await (prisma as any).interviewFeedback.create({
              data: {
                sessionId,
                transcript: transcriptCandidate,
                speakingPaceWpm: 0,
                fillerWordCount: 0,
                clarityScore: 0,
                emotionTimeline: JSON.stringify([]),
                contentFeedback: '',
                processingMetadata: JSON.stringify({ backfilledFrom: 'video_analysis', at: new Date().toISOString() }),
              },
              select: {
                sessionId: true,
                transcript: true,
                contentFeedback: true,
                processingMetadata: true,
                clarityScore: true,
                speakingPaceWpm: true,
                fillerWordCount: true,
                updatedAt: true,
              }
            })
          } else if (!String(feedback.transcript || '').trim()) {
            // Update existing row with backfilled transcript
            feedback = await (prisma as any).interviewFeedback.update({
              where: { sessionId },
              data: { transcript: transcriptCandidate },
              select: {
                sessionId: true,
                transcript: true,
                contentFeedback: true,
                processingMetadata: true,
                clarityScore: true,
                speakingPaceWpm: true,
                fillerWordCount: true,
                updatedAt: true,
              }
            })
          }
        }
      } catch {}
    }

    if (!feedback) {
      // If still no feedback yet but video analysis exists, return 200 with videoReady so UI can flip Video status
      if (videoReady) {
        return NextResponse.json({
          feedback: null,
          normalized: null,
          labels: ['Overall'],
          values: null,
          numbersMode: false,
          videoReady,
        })
      }
      return NextResponse.json({ error: 'No feedback available yet' }, { status: 404 });
    }

    // If caller requests raw content, return the plain stored Gemini output as text/plain
    if (raw === '1' || raw === 'true' || raw === 'yes') {
      const body = typeof feedback.contentFeedback === 'string' ? feedback.contentFeedback : String(feedback.contentFeedback ?? '')
      return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }

    // Attempt to parse and normalize contentFeedback on the server so the client can render immediately
    const parseContent = (src: any): any | null => {
      if (!src) return null
      try {
        if (typeof src === 'string') {
          const csvLike = src.trim()
          // Quick CSV path: numbers separated by commas
          if (/^-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?){1,}$/.test(csvLike)) {
            return { __csv: csvLike }
          }
          let t = src.trim()
          // Strip code fences and labels if present
          t = t.replace(/```\s*json\s*/gi, '').replace(/```/g, '').replace(/^json\s*:/i, '').trim()
          // Isolate braces
          const i = t.indexOf('{'); const j = t.lastIndexOf('}')
          if (i !== -1 && j !== -1 && j > i) t = t.slice(i, j + 1)
          // First attempt
          try { return JSON.parse(t) } catch {}
          // Second attempt: if the content was somehow still not parsed, try again safely
          let once: any = null
          try { once = JSON.parse(t) } catch { once = null }
          if (typeof once === 'string') {
            try { return JSON.parse(once) } catch { return null }
          }
          return once
        }
        if (typeof src === 'object') return src
      } catch {}
      return null
    }

    const toNum = (val: any): number | null => {
      if (val == null) return null
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'string') {
        const m = val.match(/\d+(?:\.\d+)?/)
        if (m) {
          const n = Number(m[0])
          return isFinite(n) ? n : null
        }
      }
      return null
    }
    const toScore10 = (val: any): number | null => {
      const n = toNum(val)
      if (n == null) return null
      if (n <= 1) return Math.max(0, Math.min(10, Math.round(n * 10)))
      if (n <= 10) return Math.max(0, Math.min(10, Math.round(n)))
      return Math.max(0, Math.min(10, Math.round(n / 10)))
    }
    const coalesce = (...vals: any[]) => vals.find(v => v !== undefined && v !== null)

    // Prepare labels and values for numbers mode
    let normalized: any = null
    let labels: string[] = ['Overall']
    let values: number[] | null = null
    let numbersMode = false
    let renderedText: string | null = null
    try {
      // Read metadata if present
      let meta: any = null
      if (feedback?.processingMetadata) {
        try { meta = JSON.parse(feedback.processingMetadata as any) } catch {}
      }
      const parsed = parseContent(feedback?.contentFeedback)
      // CSV path
      if (parsed && typeof parsed === 'object' && (parsed as any).__csv) {
        numbersMode = true
        const csv = String((parsed as any).__csv)
        const nums = (csv.match(/-?\d+(?:\.\d+)?/g) || []).map((x) => Number(x)).filter((n) => isFinite(n))
        const out = nums.slice(0, 6).map((n) => {
          if (n <= 1 && n >= 0) n = n * 10
          if (n > 10) n = n / 10
          n = Math.round(n)
          if (n < 0) n = 0
          if (n > 10) n = 10
          return n
        })
        // Pad with zeros to avoid misleading defaults
        while (out.length < 6) out.push(0)
        try { console.log('[GET feedback] Parsed CSV values count:', out.length) } catch {}
        values = out
        // Determine labels
        if (Array.isArray(meta?.labels) && meta.labels.length >= 6) {
          labels = meta.labels
        } else {
          const itype = (meta?.interviewType || 'behavioral') as string
          const defaultMetrics = itype.toLowerCase().includes('product')
            ? ['Answer Structure','Clarity of Thought','User Understanding & Insights','Prioritization & Trade-offs','Impact & Metrics Orientation']
            : itype.toLowerCase().includes('system')
            ? ['Requirements & Constraints','High-level Architecture','Scalability & Reliability','Trade-offs & Alternatives','Bottlenecks & Mitigations']
            : itype.toLowerCase().includes('technical')
            ? ['Correctness','Problem-Solving Approach','Complexity & Efficiency','Code/Communication Clarity','Testing & Edge Cases']
            : ['STAR Method Usage','Clarity & Structure','Conciseness','Impact & Outcomes','Leadership/Teamwork']
          labels = ['Overall', ...defaultMetrics]
        }
        // Build normalized
        normalized = {
          overallScore10: values[0],
          interviewType: meta?.interviewType || 'general',
          metrics: labels.slice(1).map((name, i) => ({ name, score10: values![i + 1], explanation: '' })),
          mistakes: [], summary: '', nextSteps: []
        }
        // Render narrative text for UI as a fallback
        try {
          const lines: string[] = []
          lines.push(`Overall: ${values[0]}/10 (${normalized.interviewType})`)
          if (labels.length > 1) {
            lines.push('Metrics:')
            for (let i = 1; i < labels.length; i++) {
              lines.push(`- ${labels[i]}: ${values[i]}/10`)
            }
          }
          renderedText = lines.join('\n')
        } catch {}
      } else {
        // JSON path (legacy) or plain text fallback
        const maybe = parsed && (parsed as any).analysis ? (parsed as any).analysis : parsed
        // If the parsed object is an error wrapper, return a friendly narrative and do not force numeric output
        if (maybe && typeof maybe === 'object' && (typeof (maybe as any).error === 'string' || typeof (maybe as any).message === 'string')) {
          const errMsg = String((maybe as any).error || (maybe as any).message)
          renderedText = `Error: ${errMsg}`
          numbersMode = false
        } else if (maybe && typeof maybe === 'object') {
          // Numeric-only JSON path: overallPerformance10, clarityOfThought10, structure10, technicalDepth10
          const op10 = toScore10((maybe as any).overallPerformance10)
          const cot10 = toScore10((maybe as any).clarityOfThought10)
          const st10 = toScore10((maybe as any).structure10)
          const td10 = toScore10((maybe as any).technicalDepth10)
          if (op10 != null && cot10 != null && st10 != null) {
            numbersMode = true
            const hasTech = td10 != null
            labels = hasTech
              ? ['Overall', 'Clarity of Thought', 'Structure', 'Technical Depth']
              : ['Overall', 'Clarity of Thought', 'Structure']
            values = hasTech ? [op10, cot10, st10, td10!] : [op10, cot10, st10]
            const metricsArr: Array<{ name: string; score10: number; explanation: string }> = [
              { name: 'Clarity of Thought', score10: cot10, explanation: '' },
              { name: 'Structure', score10: st10, explanation: '' },
            ]
            if (hasTech) metricsArr.push({ name: 'Technical Depth', score10: td10!, explanation: '' })
            normalized = {
              overallScore10: op10,
              interviewType: (meta?.interviewType || 'general'),
              metrics: metricsArr,
              mistakes: [],
              summary: '',
              nextSteps: []
            }
          } else {
          let score10 = toScore10(coalesce(maybe.overallScore10, (maybe as any).overall_score_10, (maybe as any).overallScore, (maybe as any).overall_score, (maybe as any).overall, (maybe as any).score))
          if (score10 == null && Array.isArray((maybe as any).metrics) && (maybe as any).metrics.length) {
            const nums = (maybe as any).metrics
              .map((m: any) => toScore10(coalesce(m?.score10, m?.score_10, m?.score, m?.value)))
              .filter((v: any) => typeof v === 'number')
            if (nums.length) score10 = Math.max(0, Math.min(10, Math.round(nums.reduce((a: number, b: number) => a + b, 0) / nums.length)))
          }
          if (score10 != null) {
            const metricsRaw = Array.isArray((maybe as any).metrics) ? (maybe as any).metrics : []
            const metrics = metricsRaw.map((m: any) => ({
              name: coalesce(m?.name, m?.metric, m?.metric_name, '') as string,
              score10: toScore10(coalesce(m?.score10, m?.score_10, m?.score, m?.value)) ?? 0,
              explanation: (coalesce(m?.explanation, m?.details, m?.reason, '') as string) || ''
            }))
            normalized = {
              overallScore10: score10,
              interviewType: coalesce((maybe as any).interviewType, (maybe as any).interview_type, 'general'),
              metrics,
              mistakes: Array.isArray((maybe as any).mistakes) ? (maybe as any).mistakes : [],
              summary: coalesce((maybe as any).summary, (maybe as any).overall_summary, (maybe as any).overview, '') || '',
              nextSteps: Array.isArray((maybe as any).nextSteps) ? (maybe as any).nextSteps : []
            }
            // Build a human-readable narrative text for the UI
            try {
              const lines: string[] = []
              lines.push(`Overall: ${normalized.overallScore10}/10 (${normalized.interviewType})`)
              if (normalized.summary) {
                lines.push('')
                lines.push('Summary:')
                lines.push(String(normalized.summary))
              }
              if (Array.isArray(normalized.metrics) && normalized.metrics.length) {
                lines.push('')
                lines.push('Metrics:')
                for (const m of normalized.metrics) {
                  const expl = m?.explanation ? ` — ${m.explanation}` : ''
                  lines.push(`- ${m.name}: ${m.score10}/10${expl}`)
                }
              }
              if (Array.isArray(normalized.mistakes) && normalized.mistakes.length) {
                lines.push('')
                lines.push('Key Mistakes & Fixes:')
                for (const mk of normalized.mistakes.slice(0, 5)) {
                  if (!mk) continue
                  const q = mk.quote ? `“${mk.quote}”` : ''
                  const why = mk.whyItMatters ? ` Why: ${mk.whyItMatters}` : ''
                  const fix = mk.fix ? ` Fix: ${mk.fix}` : ''
                  lines.push(`- ${q}${why}${fix}`.trim())
                }
              }
              if (Array.isArray(normalized.nextSteps) && normalized.nextSteps.length) {
                lines.push('')
                lines.push('Next Steps:')
                for (const s of normalized.nextSteps.slice(0, 10)) {
                  if (typeof s === 'string') lines.push(`- ${s}`)
                }
              }
              renderedText = lines.join('\n')
            } catch {}
          }
          }
        }
        // If we couldn't parse JSON at all but contentFeedback is a non-empty string, use it as narrative
        if (!normalized && typeof feedback?.contentFeedback === 'string') {
          const text = feedback.contentFeedback.trim()
          if (text) {
            // Try to detect an error JSON string and render a friendly message instead of raw JSON
            let errWrapped = false
            try {
              const obj = JSON.parse(text)
              if (obj && typeof obj === 'object' && typeof obj.error === 'string') {
                renderedText = `Error: ${obj.error}`
                errWrapped = true
              }
            } catch {}
            if (!errWrapped) {
              renderedText = text
              // Do not force numeric output from raw text; provide minimal normalized only if it's obviously meaningful
              normalized = {
                overallScore10: 0,
                interviewType: (meta?.interviewType || 'general'),
                metrics: [],
                mistakes: [],
                summary: text,
                nextSteps: []
              }
            }
            numbersMode = false
          }
        }
      }
    } catch {}

    return NextResponse.json({
      feedback: {
        sessionId: feedback.sessionId,
        transcript: feedback.transcript,
        contentFeedback: feedback.contentFeedback,
        processingMetadata: feedback.processingMetadata,
        clarityScore: feedback.clarityScore,
        speakingPaceWpm: feedback.speakingPaceWpm,
        fillerWordCount: feedback.fillerWordCount,
        updatedAt: feedback.updatedAt,
      },
      normalized,
      labels,
      values,
      numbersMode,
      videoReady,
      renderedText: renderedText || '', // Return renderedText even if it's empty
    });

  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}

// Store feedback results from Cloud Function
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const feedbackData = await request.json();

    // Validate required fields
    if (!feedbackData.transcript || !feedbackData.analysis_metrics || !feedbackData.content_feedback) {
      return NextResponse.json(
        { error: 'Invalid feedback data structure' },
        { status: 400 }
      );
    }

    // Find the interview session
    const interviewSession = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!interviewSession) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    // Store or update feedback
    const feedback = await (prisma as any).interviewFeedback.upsert({
      where: { sessionId: sessionId },
      update: {
        transcript: feedbackData.transcript,
        speakingPaceWpm: feedbackData.analysis_metrics.speaking_pace_wpm,
        fillerWordCount: feedbackData.analysis_metrics.filler_word_count,
        clarityScore: feedbackData.analysis_metrics.clarity_score || 0,
        emotionTimeline: JSON.stringify(feedbackData.emotion_timeline),
        contentFeedback: JSON.stringify(feedbackData.content_feedback),
        processingMetadata: JSON.stringify(feedbackData.processing_metadata || {}),
      },
      create: {
        sessionId: sessionId,
        transcript: feedbackData.transcript,
        speakingPaceWpm: feedbackData.analysis_metrics.speaking_pace_wpm,
        fillerWordCount: feedbackData.analysis_metrics.filler_word_count,
        clarityScore: feedbackData.analysis_metrics.clarity_score || 0,
        emotionTimeline: JSON.stringify(feedbackData.emotion_timeline),
        contentFeedback: JSON.stringify(feedbackData.content_feedback),
        processingMetadata: JSON.stringify(feedbackData.processing_metadata || {}),
      },
    });

    // Update session status
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { 
        status: 'COMPLETED',
        endedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
    });

  } catch (error) {
    console.error('Error storing feedback:', error);
    return NextResponse.json(
      { error: 'Failed to store feedback' },
      { status: 500 }
    );
  }
}
