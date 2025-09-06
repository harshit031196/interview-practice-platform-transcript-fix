import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { VertexAI } from '@google-cloud/vertexai'

// Segmented numeric feedback generation via multiple Gemini calls
// Aspects: overallPerformance10, clarityOfThought10, structure10, technicalDepth10
// Stores as minified JSON in interview_feedback.contentFeedback and maps clarityOfThought10 -> clarityScore*10

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419'
const DEFAULT_LOCATION = (process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim()
const MODEL = process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-flash'

// Assemble transcript from DB if not provided
async function assembleTranscript(sessionId: string): Promise<string> {
  // 1) transcript_items ordered by t
  try {
    const items = await prisma.transcriptItem.findMany({ where: { sessionId }, orderBy: { t: 'asc' } })
    if (items && items.length) {
      const lines = items.map((it: any) => `${it.speaker === 'AI' ? 'Interviewer' : 'Candidate'}: ${it.text}`)
      const t = lines.join('\n').trim()
      if (t.length >= 20) return t
    }
  } catch {}
  // 2) existing feedback row transcript
  try {
    const row = await prisma.interviewFeedback.findUnique({ where: { sessionId }, select: { transcript: true } })
    if (row?.transcript && row.transcript.trim().length >= 20) return row.transcript.trim()
  } catch {}
  // 3) video_analysis results JSON
  try {
    const vas = await prisma.videoAnalysis.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } })
    for (const va of vas) {
      if (typeof (va as any).results === 'string') {
        try {
          const parsed = JSON.parse((va as any).results)
          const t = extractTranscriptFromAny(parsed)
          if (t) return t
        } catch {}
      }
    }
  } catch {}
  return ''
}

function extractTranscriptFromAny(obj: any): string | null {
  try {
    if (!obj || typeof obj !== 'object') return null
    const p = (...ks: string[]) => ks.reduce((a, k) => (a && (a as any)[k] !== undefined ? (a as any)[k] : undefined), obj)
    const candidates = [
      p('videoAnalysis','speechTranscription','transcript'),
      p('speech_analysis','transcript'),
      p('speechAnalysis','transcript'),
      p('results','speech_analysis','transcript'),
      p('analysisData','videoAnalysis','speechTranscription','transcript'),
      (obj as any).transcript,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length >= 20) return c.trim()
    }
  } catch {}
  return null
}

function minifyJson(obj: any): string { return JSON.stringify(obj) }
function clampInt(n: any, lo: number, hi: number): number { n = Math.round(Number(n) || 0); return Math.max(lo, Math.min(hi, n)); }

async function getScorePlain(vertex: VertexAI, model: string, aspect: string, transcript: string, interviewType?: string): Promise<{score: number | null, finish?: string, visible?: number}> {
  const generationConfig: any = {
    maxOutputTokens: 64,
    temperature: 0.0,
    topP: 0.9,
    responseMimeType: 'text/plain',
  }
  const prompt = [
    `You are scoring one metric: ${aspect}.`,
    'Rules:',
    '- Return EXACTLY one line containing a JSON object: {"score10": N}',
    '- N must be an integer from 0 to 10.',
    '- Do NOT include any other text, labels, or code fences.',
    '',
    `INTERVIEW_TYPE: ${interviewType || 'general'}`,
    'TRANSCRIPT:',
    transcript,
  ].join('\n')
  const gm = vertex.preview.getGenerativeModel({ model, generationConfig })
  try {
    const res: any = await gm.generateContent(prompt)
    const finish = res?.response?.candidates?.[0]?.finishReason
    let txt = ''
    try { txt = typeof res?.response?.text === 'function' ? res.response.text() : '' } catch {}
    if (!txt) {
      const parts = res?.response?.candidates?.[0]?.content?.parts
      if (Array.isArray(parts)) txt = parts.map((p: any) => (p && typeof p.text === 'string' ? p.text : '')).join(' ').trim()
    }
    const visible = (txt || '').length
    if (!txt) return { score: null, finish, visible }
    // Isolate the first {...} JSON
    let s = String(txt).trim()
    const i = s.indexOf('{'); const j = s.lastIndexOf('}')
    if (i !== -1 && j !== -1 && j > i) s = s.slice(i, j + 1)
    try {
      const obj = JSON.parse(s)
      const v = clampInt((obj as any).score10, 0, 10)
      return { score: v, finish, visible }
    } catch {
      return { score: null, finish, visible }
    }
  } catch (e) {
    console.warn('[feedback-quant] getScorePlain error:', (e as any)?.message || String(e))
    return { score: null }
  }
}

async function getScoreChunked(vertex: VertexAI, aspect: string, transcript: string, interviewType?: string): Promise<number | null> {
  const chunks: string[] = []
  const size = 350
  for (let i = 0; i < transcript.length; i += size) chunks.push(transcript.slice(i, i + size))
  const scores: number[] = []
  for (const ch of chunks) {
    // Try primary model then fallback
    const one = await getScorePlain(vertex, MODEL, aspect, ch, interviewType)
    if (typeof one.score === 'number') { scores.push(one.score); continue }
    const fb = await getScorePlain(vertex, 'gemini-2.0-flash-lite', aspect, ch, interviewType)
    if (typeof fb.score === 'number') scores.push(fb.score)
  }
  if (!scores.length) return null
  const avg = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length)
  return clampInt(avg, 0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const sessionId = String(body.sessionId || '').trim()
    const interviewType = String(body.interviewType || 'general')
    let transcript: string = String(body.conversationTranscript || '')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    if (!transcript || transcript.length < 20) {
      transcript = await assembleTranscript(sessionId)
    }
    if (!transcript || transcript.length < 20) {
      return NextResponse.json({ error: 'Missing or too-short transcript' }, { status: 400 })
    }

    // Trim for prompt; we will still store full transcript in DB
    const limit = 1200
    const promptTranscript = transcript.length > limit ? transcript.slice(0, limit) : transcript

    const vertex = new VertexAI({ project: PROJECT_ID, location: DEFAULT_LOCATION })

    // Aspects
    const aspects = [
      { key: 'overallPerformance10', prompt: 'Overall performance considering content, clarity, structure, and impact' },
      { key: 'clarityOfThought10', prompt: 'Clarity of thought and articulation' },
      { key: 'structure10', prompt: 'Answer structuring and logical flow' },
      { key: 'technicalDepth10', prompt: 'Technical depth and correctness in answers' },
    ] as const

    const results: Record<string, number> = {}
    const statuses: Record<string, any> = {}

    for (const a of aspects) {
      // Try primary model text/plain
      const r1 = await getScorePlain(vertex, MODEL, a.prompt, promptTranscript.slice(0, 800), interviewType)
      console.log(`[quant] aspect=${a.key} model=${MODEL} finish=${r1.finish || 'n/a'} visible=${r1.visible ?? 0} score=${r1.score ?? 'null'}`)
      let score = r1.score
      // Fallback model
      if (score == null) {
        const r2 = await getScorePlain(vertex, 'gemini-2.0-flash-lite', a.prompt, promptTranscript.slice(0, 600), interviewType)
        console.log(`[quant] aspect=${a.key} model=gemini-2.0-flash-lite finish=${r2.finish || 'n/a'} visible=${r2.visible ?? 0} score=${r2.score ?? 'null'}`)
        score = r2.score
      }
      // Chunked fallback
      if (score == null) {
        score = await getScoreChunked(vertex, a.prompt, promptTranscript, interviewType)
        console.log(`[quant] aspect=${a.key} chunked score=${score ?? 'null'}`)
      }
      if (score == null) score = 0
      results[a.key] = score
      statuses[a.key] = { ok: score !== 0, used: score != null ? (r1.score != null ? MODEL : 'gemini-2.0-flash-lite') : 'none', loc: DEFAULT_LOCATION }
    }

    const contentFeedback = minifyJson(results)
    const processingMetadata = minifyJson({
      model: MODEL,
      location: DEFAULT_LOCATION,
      promptVersion: 'ifb-segmented-v1',
      generatedAt: new Date().toISOString(),
      aspects: Object.keys(results),
      statuses,
      interviewType,
    })

    // Map clarityOfThought10 -> clarityScore (0-100)
    const clarityScore = clampInt(results.clarityOfThought10, 0, 10) * 10

    // Upsert
    await prisma.interviewFeedback.upsert({
      where: { sessionId },
      update: {
        transcript,
        contentFeedback,
        processingMetadata,
        clarityScore,
        speakingPaceWpm: 0,
        fillerWordCount: 0,
        emotionTimeline: '[]',
      },
      create: {
        sessionId,
        transcript,
        contentFeedback,
        processingMetadata,
        clarityScore,
        speakingPaceWpm: 0,
        fillerWordCount: 0,
        emotionTimeline: '[]',
      }
    })

    return NextResponse.json({ success: true, metrics: results })
  } catch (e) {
    console.error('[feedback-quant] fatal:', (e as any)?.message || String(e))
    return NextResponse.json({ error: 'Failed to generate segmented feedback' }, { status: 500 })
  }
}
