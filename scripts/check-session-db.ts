#!/usr/bin/env tsx
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
if (!process.env.DATABASE_URL) dotenv.config()
import { PrismaClient } from '@prisma/client'

// Utility: detect if a string looks like CSV numbers
const looksLikeCsv = (s: string) => /\d\s*,\s*\d/.test(s)

function metricNamesForType(interviewType?: string): string[] {
  const type = (interviewType || '').toLowerCase()
  if (type.includes('product')) {
    return [
      'Answer Structure',
      'Clarity of Thought',
      'User Understanding & Insights',
      'Prioritization & Trade-offs',
      'Impact & Metrics Orientation',
    ]
  }
  if (type.includes('system')) {
    return [
      'Requirements & Constraints',
      'High-level Architecture',
      'Scalability & Reliability',
      'Trade-offs & Alternatives',
      'Bottlenecks & Mitigations',
    ]
  }
  if (type.includes('technical')) {
    return [
      'Correctness',
      'Problem-Solving Approach',
      'Complexity & Efficiency',
      'Code/Communication Clarity',
      'Testing & Edge Cases',
    ]
  }
  return [
    'STAR Method Usage',
    'Clarity & Structure',
    'Conciseness',
    'Impact & Outcomes',
    'Leadership/Teamwork',
  ]
}

// Normalize numbers: map to 0..10 ints without padding
function extractNumbersNoPad(s: string): number[] {
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

async function main() {
  const sessionId = process.argv[2]
  if (!sessionId) {
    console.error('Usage: tsx scripts/check-session-db.ts <sessionId>')
    process.exit(1)
  }

  const prisma = new PrismaClient({ log: ['error', 'warn'] })

  try {
    const dbUrl = process.env.DATABASE_URL || '(not set)'
    console.log('=== DB Inspector ===')
    console.log('DATABASE_URL set:', dbUrl ? 'yes' : 'no')
    console.log('Session ID:', sessionId)

    // 1) Interview Session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        intervieweeId: true,
        status: true,
        interviewType: true,
        isConversational: true,
        startedAt: true,
        endedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    console.log('\n-- interview_sessions --')
    if (!session) {
      console.log('not found')
    } else {
      console.log(session)
    }

    // 2) Recording
    const recording = await prisma.recording.findUnique({
      where: { sessionId },
    })
    console.log('\n-- recordings (by sessionId) --')
    console.log(recording ? recording : 'not found')

    // 3) Interview Feedback (numbers-only CSV expected)
    const feedback = await (prisma as any).interviewFeedback.findUnique({
      where: { sessionId },
      select: {
        sessionId: true,
        transcript: true,
        contentFeedback: true,
        processingMetadata: true,
        clarityScore: true,
        speakingPaceWpm: true,
        fillerWordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    console.log('\n-- interview_feedback (by sessionId) --')
    if (!feedback) {
      console.log('not found')
    } else {
      console.log({
        sessionId: feedback.sessionId,
        clarityScore: feedback.clarityScore,
        speakingPaceWpm: feedback.speakingPaceWpm,
        fillerWordCount: feedback.fillerWordCount,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
      })

      const pm = (() => {
        try { return feedback.processingMetadata ? JSON.parse(feedback.processingMetadata as any) : null } catch { return null }
      })()
      const labels = Array.isArray(pm?.labels) && pm.labels.length >= 6 ? pm.labels : ['Overall', ...metricNamesForType(pm?.interviewType || session?.interviewType)]
      const numbersMode = !!pm?.numbersMode || (typeof feedback.contentFeedback === 'string' && looksLikeCsv(feedback.contentFeedback))

      // Parse contentFeedback
      let values: number[] | null = null
      if (typeof feedback.contentFeedback === 'string' && looksLikeCsv(feedback.contentFeedback)) {
        values = extractNumbersNoPad(feedback.contentFeedback)
        while ((values?.length || 0) < 6) values!.push(0)
      } else if (typeof feedback.contentFeedback === 'string') {
        // Try JSON
        try {
          const parsed = JSON.parse(feedback.contentFeedback)
          if (parsed && typeof parsed === 'object') {
            const maybe = (parsed as any).analysis ? (parsed as any).analysis : parsed
            const arr = [
              maybe?.overallScore10 ?? maybe?.overall_score_10 ?? maybe?.overallScore ?? maybe?.overall ?? maybe?.score,
              ...(Array.isArray(maybe?.metrics) ? maybe.metrics.map((m: any) => m?.score10 ?? m?.score) : []),
            ]
            values = arr
              .filter((v) => v != null)
              .slice(0, 6)
              .map((v) => Number(v))
              .map((n) => (Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n <= 1 ? n * 10 : n > 10 ? n / 10 : n))) : 0))
            while ((values?.length || 0) < 6) values!.push(0)
          }
        } catch {
          values = null
        }
      }

      console.log('\nDerived (numbersMode, labels, values):')
      console.log({ numbersMode, labels, values })

      if (values) {
        const normalized = {
          overallScore10: values[0],
          interviewType: pm?.interviewType || session?.interviewType || 'general',
          metrics: labels.slice(1).map((name: string, i: number) => ({ name, score10: values![i + 1] ?? 0, explanation: '' })),
          mistakes: [], summary: '', nextSteps: [],
        }
        console.log('\nNormalized:')
        console.dir(normalized, { depth: null })
      }

      console.log('\nSQL you can run to fetch feedback (psql):')
      console.log('SELECT "sessionId", "contentFeedback", "processingMetadata", "clarityScore", "speakingPaceWpm", "fillerWordCount", "updatedAt" FROM public.interview_feedback WHERE "sessionId" = $1 LIMIT 1;')
    }

    // 4) Video Analysis (segments)
    const analyses = await prisma.videoAnalysis.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        userId: true,
        segmentIndex: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    console.log('\n-- video_analysis (latest 5) --')
    console.log({ count: analyses.length, items: analyses })

    // 5) Vision frames (optional)
    try {
      const frames = await prisma.visionAnalysisFrame.findMany({
        where: { sessionId },
        select: { id: true, timestamp: true },
        take: 5,
        orderBy: { timestamp: 'desc' },
      })
      console.log('\n-- vision_analysis_frames (latest 5) --')
      console.log({ count: frames.length, items: frames })
    } catch (_) {
      // table may be empty or not used yet
    }

  } catch (err) {
    console.error('Error:', err)
  } finally {
    process.exit(0)
  }
}

main()
