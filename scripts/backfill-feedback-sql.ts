/*
  Batch backfill script to generate Interview Feedback via Gemini using a single SQL UPSERT.

  Usage examples:
    - npx tsx scripts/backfill-feedback-sql.ts --limit 5 --days 14
    - npm run backfill:feedback-sql -- --session <SESSION_ID>
    - npm run backfill:feedback-sql -- --limit 20 --force

  Flags:
    --session <id>   Process a specific sessionId (can be provided multiple times)
    --limit <n>      Max number of sessions to process (default 10)
    --days <n>       Look back N days for sessions (default 7)
    --force          Re-generate even if feedback already exists
    --dry            Do not execute SQL (print to console)
*/

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { prisma } from '../lib/prisma'
import { VertexAI } from '@google-cloud/vertexai'

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
const vertex_ai = new VertexAI({ project: PROJECT_ID, location: DEFAULT_LOCATION })

const ENV_MODEL = process.env.VERTEX_GEMINI_MODEL || process.env.GEMINI_MODEL
const MODEL_CANDIDATES: string[] = [
  ENV_MODEL,
  'gemini-1.5-flash-002',
  'gemini-1.5-pro-002',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
].filter(Boolean) as string[]

const ENV_LOCATIONS = (process.env.VERTEX_LOCATIONS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const LOCATION_CANDIDATES: string[] = ENV_LOCATIONS.length
  ? ENV_LOCATIONS
  : Array.from(new Set([DEFAULT_LOCATION, 'us-east5']))

function isModelNotFound(err: any): boolean {
  const code = err?.code ?? err?.status
  const msg = (err?.message || '').toString()
  return code === 404 || /NOT_FOUND/i.test(String(err?.status)) || /was not found|Publisher Model/i.test(msg)
}

function buildSqlPrompt(input: {
  sessionId: string
  transcript: string
  jobRole?: string
  company?: string
  interviewType?: string
}): string {
  const { sessionId, transcript, jobRole = 'Software Engineer', company = 'FAANG', interviewType = 'behavioral' } = input
  const nowIso = new Date().toISOString()
  return [
    'Role: You are a data formatter that outputs a single PostgreSQL SQL statement to insert or update interview feedback.',
    '',
    'Input you will receive (examples shown as placeholders):',
    `SESSION_ID: ${sessionId}`,
    `FULL_TRANSCRIPT: ${transcript}`,
    `CONTEXT: jobRole=${jobRole}; company=${company}; interviewType=${interviewType}`,
    '',
    'Optional metrics you infer from the transcript:',
    'CLARITY_SCORE_10: integer 0–10',
    'SPEAKING_PACE_WPM: integer (words per minute)',
    'FILLER_WORD_COUNT: integer',
    '',
    'Optional structured feedback you infer:',
    'Strengths, Areas to Improve, per-turn notes, section scores, overall score.',
    '',
    'Target table & columns (PostgreSQL):',
    'interview_feedback("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
    '',
    'Notes about types:',
    'contentFeedback and processingMetadata are stored as TEXT containing minified JSON (strings).',
    'Use NOW() for "updatedAt".',
    'We upsert by "sessionId": ON CONFLICT ("sessionId") DO UPDATE SET ....',
    '',
    'Output contract (must follow exactly):',
    'Return only one SQL statement (no prose, no Markdown, no code fences).',
    'Use dollar-quoted strings for long text/JSON to avoid escaping issues:',
    '$t$ ... $t$ for transcript,',
    '$j$ ... $j$ for contentFeedback (minified JSON),',
    '$m$ ... $m$ for processingMetadata (minified JSON).',
    'If your content would contain $t$, $j$, or $m$, switch to a different delimiter (e.g., $tt$, $jj$, $mm$) consistently.',
    'Minify all JSON (no newlines or spaces beyond those required in strings).',
    'Populate numbers as integers. If a metric is unknown, use 0 (not NULL) for numeric columns and [] for emotionTimeline to satisfy NOT NULL constraints.',
    'Provide overallScore10 both at the top level of contentFeedback and inside analysis.overallScore10 (backward-compat).',
    'Use UPSERT: INSERT ... ON CONFLICT ("sessionId") DO UPDATE SET ... updating all fields except "sessionId".',
    '',
    'contentFeedback JSON shape (example – minify in output):',
    '{"overallScore10":7,"rubric":{"content":7,"structure":6,"delivery":7},"strengths":["Clear problem framing","Good STAR examples"],"areasToImprove":["Shorten answers","Quantify impact more"],"fillerWords":{"count":14,"top":[["um",6],["like",5],["you know",3]]},"turns":[{"q":"Tell me about yourself","aExcerpt":"...","notes":"Good hook; trim length","score10":7},{"q":"Product metrics you track?","aExcerpt":"...","notes":"Add retention cohorts","score10":6}],"analysis":{"overallScore10":7,"speakingPaceWpm":142,"clarityScore10":7,"recommendations":[{"tip":"Use concrete numbers in first 60s","impact":"high"},{"tip":"Pause 1s before answering","impact":"medium"}]}}',
    '',
    'processingMetadata JSON shape (example – minify in output):',
    `{"model":"${ENV_MODEL || 'gemini-2.5-flash'}","promptVersion":"ifb-sql-v1","scaleNotes":"scores are 0-10 integers","source":"wingman-interview","generatedAt":"${nowIso}"}`,
    '',
    'Formatting rules for metrics:',
    'clarityScore = CLARITY_SCORE_10 * 10 (0–100 integer).',
    'speakingPaceWpm = SPEAKING_PACE_WPM (integer).',
    'fillerWordCount = FILLER_WORD_COUNT (integer).',
    'If you do not infer a numeric metric, insert 0 for that column.',
    'Set emotionTimeline to a JSON string of [] when unknown (must be a TEXT value containing the JSON string for empty array).',
    '',
    'Final SQL you must output (template; replace placeholders with real values and minified JSON):',
    'INSERT INTO interview_feedback',
    '("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
    'VALUES',
    '(',
    `  '${sessionId}',`,
    '  $t$FULL_TRANSCRIPT$t$,',
    '  $j${contentFeedback_minified_json}$j$,',
    '  $m${processingMetadata_minified_json}$m$,',
    '  CLARITY_SCORE_10 * 10,',
    '  SPEAKING_PACE_WPM,',
    '  FILLER_WORD_COUNT,',
    "  '[]',",
    '  NOW()',
    ')',
    'ON CONFLICT ("sessionId") DO UPDATE SET',
    '  "transcript" = EXCLUDED."transcript",',
    '  "contentFeedback" = EXCLUDED."contentFeedback",',
    '  "processingMetadata" = EXCLUDED."processingMetadata",',
    '  "clarityScore" = EXCLUDED."clarityScore",',
    '  "speakingPaceWpm" = EXCLUDED."speakingPaceWpm",',
    '  "fillerWordCount" = EXCLUDED."fillerWordCount",',
    '  "emotionTimeline" = EXCLUDED."emotionTimeline",',
    '  "updatedAt" = NOW();',
    '',
    'Quality checks before you output:',
    'Ensure there is exactly one SQL statement.',
    'Ensure JSON is valid and minified.',
    'Ensure dollar-quote delimiters don’t appear inside their bodies; if they do, switch delimiters and keep them consistent.',
    'Ensure integers are numeric (no quotes).',
    'Ensure both overallScore10 (top level) and analysis.overallScore10 are present and equal.'
  ].join('\n')
}

function extractSql(raw: string): string | null {
  if (!raw) return null
  let t = String(raw).trim()
  t = t.replace(/```\s*sql\s*/gi, '').replace(/```/g, '').trim()
  const startIdx = t.toUpperCase().indexOf('INSERT INTO INTERVIEW FEEDBACK')
  const altStartIdx = t.toUpperCase().indexOf('INSERT INTO INTERVIEW_FEEDBACK')
  const sIdx = startIdx !== -1 ? startIdx : altStartIdx
  if (sIdx === -1) return null
  return t.slice(sIdx).trim()
}

function isSafeUpsert(sql: string): boolean {
  const s = sql.trim()
  if (!/^INSERT\s+INTO\s+interview_feedback\s*\(/i.test(s)) return false
  if (!/ON\s+CONFLICT\s*\(\s*"sessionId"\s*\)\s*DO\s+UPDATE\s+SET/i.test(s)) return false
  if (/(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)\b/i.test(s)) return false
  if (/(;\s*--|\/\*)/.test(s)) return false
  const forbiddenTables = /(\busers\b|\bvideo_analysis\b|\bvision_analysis_frames\b|\binterview_sessions\b|\breports\b|\bmessages\b)/i
  if (forbiddenTables.test(s)) return false
  return true
}

function parseArgs(argv: string[]) {
  const out: any = { sessions: [] as string[], limit: 10, days: 7, force: false, dry: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--session' && argv[i + 1]) { out.sessions.push(argv[++i]); continue }
    if (a === '--limit' && argv[i + 1]) { out.limit = Number(argv[++i]); continue }
    if (a === '--days' && argv[i + 1]) { out.days = Number(argv[++i]); continue }
    if (a === '--force') { out.force = true; continue }
    if (a === '--dry') { out.dry = true; continue }
  }
  return out
}

async function buildTranscript(sessionId: string): Promise<string | null> {
  // 1) If existing feedback has transcript, prefer it
  const fb = await (prisma as any).interviewFeedback.findUnique({ where: { sessionId }, select: { transcript: true } })
  if (fb?.transcript && typeof fb.transcript === 'string' && fb.transcript.trim().length > 0) {
    return fb.transcript
  }
  // 2) Use transcript items
  const items = await prisma.transcriptItem.findMany({ where: { sessionId }, orderBy: { t: 'asc' } })
  if (items && items.length) {
    const lines = items.map(it => {
      const role = (it.speaker === 'AI') ? 'Interviewer' : 'Candidate'
      return `${role}: ${it.text}`
    })
    return lines.join('\n')
  }
  // 3) Fallback: aggregate transcript from video_analysis segments (support multiple shapes)
  try {
    const segments = await prisma.videoAnalysis.findMany({ where: { sessionId }, orderBy: { segmentIndex: 'asc' } })
    if (segments && segments.length) {
      const parts: string[] = []
      for (const seg of segments) {
        if (!seg?.results) continue
        try {
          const obj = JSON.parse(seg.results)
          // try shapes in order
          const t1 = obj?.videoAnalysis?.speechTranscription?.transcript
          const t2 = obj?.speech_analysis?.transcript
          const t3 = obj?.speechAnalysis?.transcript
          const pick = [t1, t2, t3].find(v => typeof v === 'string' && v.trim().length > 0)
          if (typeof pick === 'string' && pick.trim()) {
            parts.push(pick.trim())
          }
        } catch {}
      }
      const joined = parts.join('\n').trim()
      if (joined.length >= 20) return joined
    }
  } catch {}
  return null
}

async function generateSql(sessionId: string, transcript: string): Promise<{ sql: string, model: string, location: string } | null> {
  const generationConfig = { maxOutputTokens: 1200, temperature: 0.1, topP: 0.8, responseMimeType: 'text/plain' } as const
  const prompt = buildSqlPrompt({ sessionId, transcript })
  for (const loc of LOCATION_CANDIDATES) {
    for (const model of MODEL_CANDIDATES) {
      try {
        const client = loc === DEFAULT_LOCATION ? vertex_ai : new VertexAI({ project: PROJECT_ID, location: loc })
        const generativeModel = client.preview.getGenerativeModel({ model, generationConfig })
        const result = await generativeModel.generateContent(prompt)
        const response: any = result.response
        let text = ''
        const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined
        if (Array.isArray(parts) && parts.length) {
          text = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim()
        }
        if (!text && typeof response?.text === 'function') {
          try { const t = response.text(); if (typeof t === 'string') text = t } catch {}
        }
        const extracted = extractSql(text)
        if (extracted && isSafeUpsert(extracted)) {
          return { sql: extracted, model, location: loc }
        }
      } catch (e) {
        if (!isModelNotFound(e)) {
          // continue
        }
      }
    }
  }
  return null
}

async function main() {
  const args = parseArgs(process.argv)
  const sessionsToProcess: string[] = []

  if (args.sessions.length) {
    sessionsToProcess.push(...args.sessions)
  } else {
    const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000)
    const candidates = await prisma.interviewSession.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: args.limit,
      include: { feedback: true },
    })
    for (const s of candidates) {
      if (!s.feedback || args.force) sessionsToProcess.push(s.id)
    }
  }

  console.log(`[Backfill] Planning to process ${sessionsToProcess.length} session(s)`) 

  let success = 0, failed = 0, skipped = 0

  for (const sessionId of sessionsToProcess) {
    try {
      console.log(`\n[Backfill] Processing ${sessionId}`)
      const transcript = await buildTranscript(sessionId)
      if (!transcript || transcript.trim().length < 20) {
        console.log(`[Backfill] Skip: transcript not available or too short`)
        skipped++
        continue
      }
      const result = await generateSql(sessionId, transcript)
      if (!result) {
        console.log(`[Backfill] Failed: model did not return valid SQL`)
        failed++
        continue
      }
      const { sql, model, location } = result
      if (args.dry) {
        console.log(`[Backfill] Dry-run SQL for ${sessionId} (model=${model}, loc=${location}):\n${sql}`)
        success++
        continue
      }
      const affected: unknown = await (prisma as any).$executeRawUnsafe(sql)
      try { await prisma.interviewSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED', endedAt: new Date() } }) } catch {}
      console.log(`[Backfill] Wrote feedback for ${sessionId} (affected=${String(affected)}) using ${model}@${location}`)
      success++
    } catch (e: any) {
      console.error(`[Backfill] Error for ${sessionId}:`, e?.message || String(e))
      failed++
    }
  }

  console.log(`\n[Backfill] Done. success=${success} failed=${failed} skipped=${skipped}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
