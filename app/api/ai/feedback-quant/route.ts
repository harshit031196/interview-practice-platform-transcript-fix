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

async function getScorePlain(
  vertex: VertexAI,
  model: string,
  aspect: string,
  transcript: string,
  interviewType?: string,
  opts?: { forChunk?: boolean }
): Promise<{score: number | null, finish?: string, visible?: number}> {
  const generationConfig: any = {
    maxOutputTokens: 128,
    temperature: 0.0,
    topP: 0.9,
    responseMimeType: 'text/plain',
  }
  const guidelines = [
    'Guidelines:',
    '- Base the score on the entire transcript; consider both strengths and weaknesses.',
    '- Do not over-penalize minor filler words or brief pauses.',
    // For chunked prompts, avoid pushing to mid-range just for being short
    ...(opts?.forChunk
      ? ['- Do NOT default to mid-range just because the excerpt is short; score based on the evidence present.']
      : ['- If content is limited but not incorrect, keep within 5–7 unless clearly poor.']
    ),
    '- Consider the interview type (behavioral, technical, system, product) when judging depth and structure.',
  ].join('\n')
  const prompt = [
    `You are an expert interviewer. Score ONE metric (0-10, integer): ${aspect}.`,
    '',
    'Calibration (use this scale distribution):',
    '- 9–10: Outstanding: clear evidence throughout; precise, confident, and complete.',
    '- 7–8: Strong/typical good candidate: generally clear with minor gaps.',
    '- 5–6: Acceptable/average baseline: somewhat mixed but adequate.',
    '- 3–4: Below average: several issues or missing elements.',
    '- 0–2: Poor: largely missing, incorrect, or incoherent.',
    '',
    guidelines,
    '',
    'Output format:',
    '- Return EXACTLY one line JSON: {"score10": N} (N is an integer 0–10).',
    '- No extra text, labels, or code fences.',
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

async function getScoreChunked(
  vertex: VertexAI,
  aspect: string,
  transcript: string,
  interviewType?: string,
  model: string = MODEL
): Promise<number | null> {
  const chunks: string[] = []
  const size = 2500
  const overlap = 250
  for (let i = 0; i < transcript.length; i += (size - overlap)) {
    const ch = transcript.slice(i, Math.min(i + size, transcript.length))
    if (ch) chunks.push(ch)
  }
  const scored: Array<{ s: number; w: number }> = []
  for (let idx = 0; idx < chunks.length; idx++) {
    const ch = chunks[idx]
    // Try primary model then fallback
    const one = await getScorePlain(vertex, model, aspect, ch, interviewType, { forChunk: true })
    if (typeof one.score === 'number') {
      console.log(`[quant] chunk ${idx + 1}/${chunks.length} len=${ch.length} model=${model} score=${one.score}`)
      scored.push({ s: one.score, w: ch.length })
      continue
    }
    const fbModel = 'gemini-2.0-flash-lite'
    const fb = await getScorePlain(vertex, fbModel, aspect, ch, interviewType, { forChunk: true })
    if (typeof fb.score === 'number') {
      console.log(`[quant] chunk ${idx + 1}/${chunks.length} len=${ch.length} model=${fbModel} score=${fb.score}`)
      scored.push({ s: fb.score, w: ch.length })
    } else {
      console.log(`[quant] chunk ${idx + 1}/${chunks.length} len=${ch.length} both-models-failed`)
    }
  }
  if (!scored.length) return null
  const sumW = scored.reduce((a, x) => a + x.w, 0)
  const avg = Math.round(scored.reduce((a, x) => a + x.s * (x.w / (sumW || 1)), 0))
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

    // Use the FULL transcript for scoring; chunking will handle long inputs safely
    const promptTranscript = transcript

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

    const MAX_SINGLE = 8000
    for (const a of aspects) {
      let score: number | null = null
      let usedMode = 'none'

      if (promptTranscript.length <= MAX_SINGLE) {
        // Prefer single-shot for medium transcripts
        const r1 = await getScorePlain(vertex, MODEL, a.prompt, promptTranscript, interviewType)
        console.log(`[quant] aspect=${a.key} single model=${MODEL} finish=${r1.finish || 'n/a'} visible=${r1.visible ?? 0} score=${r1.score ?? 'null'} (len=${promptTranscript.length})`)
        score = r1.score
        usedMode = 'single'
        if (score == null) {
          const r2 = await getScorePlain(vertex, 'gemini-2.0-flash-lite', a.prompt, promptTranscript, interviewType)
          console.log(`[quant] aspect=${a.key} single model=gemini-2.0-flash-lite finish=${r2.finish || 'n/a'} visible=${r2.visible ?? 0} score=${r2.score ?? 'null'} (len=${promptTranscript.length})`)
          score = r2.score
        }
        if (score == null) {
          // Fallback to chunked aggregation
          score = await getScoreChunked(vertex, a.prompt, promptTranscript, interviewType)
          usedMode = 'singleThenChunked'
          console.log(`[quant] aspect=${a.key} chunked score=${score ?? 'null'} (fallback, len=${promptTranscript.length})`)
        }
      } else {
        // Long transcript: try single-shot once, then chunk if needed
        const r1 = await getScorePlain(vertex, MODEL, a.prompt, promptTranscript, interviewType)
        console.log(`[quant] aspect=${a.key} single-long model=${MODEL} finish=${r1.finish || 'n/a'} visible=${r1.visible ?? 0} score=${r1.score ?? 'null'} (len=${promptTranscript.length})`)
        score = r1.score
        usedMode = 'singleLong'
        if (score == null) {
          const r2 = await getScorePlain(vertex, 'gemini-2.0-flash-lite', a.prompt, promptTranscript, interviewType)
          console.log(`[quant] aspect=${a.key} single-long model=gemini-2.0-flash-lite finish=${r2.finish || 'n/a'} visible=${r2.visible ?? 0} score=${r2.score ?? 'null'} (len=${promptTranscript.length})`)
          score = r2.score
        }
        if (score == null) {
          score = await getScoreChunked(vertex, a.prompt, promptTranscript, interviewType)
          usedMode = 'chunked'
          console.log(`[quant] aspect=${a.key} chunked score=${score ?? 'null'} (full transcript, len=${promptTranscript.length})`)
        }
      }
      if (score == null) score = 0
      results[a.key] = score
      statuses[a.key] = { ok: score !== 0, used: usedMode, loc: DEFAULT_LOCATION }
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
