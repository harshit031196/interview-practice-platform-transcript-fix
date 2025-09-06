import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VertexAI } from '@google-cloud/vertexai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize Vertex AI similar to /api/ai/feedback
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419';
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertex_ai = new VertexAI({ project: PROJECT_ID, location: DEFAULT_LOCATION });

const ENV_MODEL = process.env.VERTEX_GEMINI_MODEL || process.env.GEMINI_MODEL;
// Prefer gemini-2.5-flash; ignore ENV_MODEL if it's a 1.5 variant to avoid NOT_FOUND
const SAFE_ENV_MODEL = ENV_MODEL && !/^\s*gemini-1\.5/i.test(ENV_MODEL) ? ENV_MODEL : undefined;
const MODEL_CANDIDATES: string[] = [
  'gemini-2.5-flash',
  SAFE_ENV_MODEL,
].filter(Boolean) as string[];

const ENV_LOCATIONS = (process.env.VERTEX_LOCATIONS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Default to us-central1 only (same as interviewer); allow explicit overrides via ENV_LOCATIONS
const LOCATION_CANDIDATES: string[] = ENV_LOCATIONS.length
  ? ENV_LOCATIONS
  : [DEFAULT_LOCATION];

const isModelNotFound = (err: any): boolean => {
  const code = err?.code ?? err?.status;
  const msg = (err?.message || '').toString();
  return code === 404 || /NOT_FOUND/i.test(String(err?.status)) || /was not found|Publisher Model/i.test(msg);
}

const DEBUG = String(process.env.FEEDBACK_SQL_DEBUG).toLowerCase() === 'true'
const debugLog = (...args: any[]) => { if (DEBUG) try { console.log('[feedback-sql]', ...args) } catch {} }
debugLog('candidates', { models: MODEL_CANDIDATES, locations: (process.env.VERTEX_LOCATIONS || DEFAULT_LOCATION) })

// Ultra-minimal prompt used as a second-chance fallback to avoid empty outputs
function buildMinimalSqlPrompt(sessionId: string, interviewType?: string): string {
  const nowIso = new Date().toISOString();
  const itype = interviewType || 'behavioral'
  return [
    'Return ONLY one SQL UPSERT for PostgreSQL to insert/update the interview_feedback row.',
    'Rules:',
    '- Begin with INSERT INTO interview_feedback and end with a semicolon.',
    '- Use the exact column list: ("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
    '- Use dollar-quoted strings:',
    '  $t$FULL_TRANSCRIPT$t$ for transcript (exact token FULL_TRANSCRIPT).',
    '  $j${minified JSON}$j$ for contentFeedback.',
    '  $m${minified JSON}$m$ for processingMetadata.',
    '- JSON must be minified (no spaces/newlines).',
    '- contentFeedback must contain ONLY numeric keys: overallPerformance10, clarityOfThought10, structure10.',
    '- Use ON CONFLICT ("sessionId") DO UPDATE SET to upsert all fields.',
    '- Use NOW() for updatedAt.',
    '- If metrics are unknown, set clarityScore=0, speakingPaceWpm=0, fillerWordCount=0 and emotionTimeline to \"[]\".',
    '',
    'Values to use:',
    `- sessionId='${sessionId}'`,
    `- interviewType='${itype}'`,
    `- processingMetadata: {"model":"gemini-2.5-flash","promptVersion":"ifb-quant-min-v1","source":"wingman-interview","generatedAt":"${nowIso}","metricKeys":["overallPerformance10","clarityOfThought10","structure10"]}`,
    `- contentFeedback: {"overallPerformance10":0,"clarityOfThought10":0,"structure10":0}`,
  ].join('\n')
}

// Safely inject the actual transcript into the SQL's $t$FULL_TRANSCRIPT$t$ segment
function injectTranscript(sql: string, transcript: string): string {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = sql.match(/(\$[a-zA-Z]*\$)FULL_TRANSCRIPT\1/)
  if (!m) return sql
  let delim = m[1]
  // If transcript contains the delimiter, select a new one not present in transcript or SQL
  if (transcript.includes(delim)) {
    const candidates = ['$tt$', '$tx$', '$tm$', '$t1$', '$tq$']
    const pick = candidates.find(d => !transcript.includes(d) && !sql.includes(d)) || '$tt$'
    // Replace only the transcript block delimiters
    const oldBlock = new RegExp(`${escapeRegExp(delim)}FULL_TRANSCRIPT${escapeRegExp(delim)}`)
    sql = sql.replace(oldBlock, `${pick}FULL_TRANSCRIPT${pick}`)
    delim = pick
  }
  const blockRe = new RegExp(`${escapeRegExp(delim)}FULL_TRANSCRIPT${escapeRegExp(delim)}`)
  return sql.replace(blockRe, `${delim}${transcript}${delim}`)
}

// Build the SQL-only prompt with safety tweaks for our schema (emotionTimeline required; non-null numeric columns default to 0)
function buildSqlPrompt(input: {
  sessionId: string;
  transcript: string;
  jobRole?: string;
  company?: string;
  interviewType?: string;
}): string {
  const { sessionId, transcript, jobRole = 'Software Engineer', company = 'FAANG', interviewType = 'behavioral' } = input;
  const nowIso = new Date().toISOString();
  return [
    'Role: You are a data formatter that outputs a single PostgreSQL SQL statement to insert or update interview feedback.',
    '',
    'Input you will receive (examples shown as placeholders):',
    `SESSION_ID: ${sessionId}`,
    `FULL_TRANSCRIPT: ${transcript}`,
    `CONTEXT: jobRole=${jobRole}; company=${company}; interviewType=${interviewType}`,
    '',
    'Required numeric metrics you infer from the transcript (integers 0–10):',
    'OVERALL_PERFORMANCE_10: integer 0–10',
    'CLARITY_OF_THOUGHT_10: integer 0–10',
    'STRUCTURE_10: integer 0–10',
    '',
    'Optional quantifiable metrics:',
    'SPEAKING_PACE_WPM: integer (words per minute; use 0 if unknown)',
    'FILLER_WORD_COUNT: integer (use 0 if unknown)',
    '',
    'Do NOT include narrative text. Only numeric, quantifiable results.',
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
    'Minify all JSON (no spaces or newlines).',
    'Populate numbers as integers. If a metric is unknown, use 0 (not NULL) for numeric columns and [] for emotionTimeline to satisfy NOT NULL constraints.',
    'contentFeedback must contain ONLY numeric fields and no narrative. Use EXACT keys: overallPerformance10, clarityOfThought10, structure10.',
    'Use UPSERT: INSERT ... ON CONFLICT ("sessionId") DO UPDATE SET ... updating all fields except "sessionId".',
    '',
    'contentFeedback JSON shape (example – minify in output):',
    '{"overallPerformance10":7,"clarityOfThought10":7,"structure10":6}',
    '',
    'processingMetadata JSON shape (example – minify in output):',
    `{"model":"${ENV_MODEL || 'gemini-2.5-flash'}","promptVersion":"ifb-quant-v1","scaleNotes":"scores are 0-10 integers","source":"wingman-interview","generatedAt":"${nowIso}","metricKeys":["overallPerformance10","clarityOfThought10","structure10"]}`,
    '',
    'Formatting rules for metrics:',
    'clarityScore = CLARITY_OF_THOUGHT_10 * 10 (0–100 integer).',
    'speakingPaceWpm = SPEAKING_PACE_WPM (integer; 0 if unknown).',
    'fillerWordCount = FILLER_WORD_COUNT (integer; 0 if unknown).',
    'If you do not infer a numeric metric, insert 0 for that column.',
    'Set emotionTimeline to a JSON string of [] when unknown (e.g., $e$[]$e$ inside quotes is NOT allowed; you must produce a TEXT value that is the JSON string for an empty array, i.e., \"[]\").',
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
    '  CLARITY_OF_THOUGHT_10 * 10,',
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
    'Ensure contentFeedback contains only numeric keys: overallPerformance10, clarityOfThought10, structure10.'
  ].join('\n');
}

function extractSql(raw: string): string | null {
  if (!raw) return null;
  let t = String(raw).trim();
  // Remove code fences and labels (model sometimes wraps output)
  t = t.replace(/```\s*sql\s*/gi, '').replace(/```/g, '').trim();
  // Find start allowing quoted table names and optional schema
  const upper = t.toUpperCase();
  let startIdx = upper.indexOf('INSERT INTO INTERVIEW_FEEDBACK');
  if (startIdx === -1) {
    startIdx = upper.indexOf('INSERT INTO "INTERVIEW_FEEDBACK"');
  }
  if (startIdx === -1) {
    startIdx = upper.indexOf('INSERT INTO PUBLIC.INTERVIEW_FEEDBACK');
  }
  if (startIdx === -1) {
    startIdx = upper.indexOf('INSERT INTO PUBLIC."INTERVIEW_FEEDBACK"');
  }
  if (startIdx === -1) return null;
  const stmt = t.slice(startIdx).trim();
  return stmt;
}

function isSafeUpsert(sql: string): boolean {
  const s = sql.trim();
  // Allow optional schema and quoted identifiers
  if (!/^INSERT\s+INTO\s+(?:"?public"?\.)?"?interview_feedback"?\s*\(/i.test(s)) return false;
  if (!/ON\s+CONFLICT\s*\(\s*"sessionId"\s*\)\s*DO\s+UPDATE\s+SET/i.test(s)) return false;
  // Disallow dangerous keywords
  if (/(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)\b/i.test(s)) return false;
  if (/(;\s*--|\/\*)/.test(s)) return false; // comments or multi-statement tricks
  // Ensure it only references our table
  const forbiddenTables = /(\busers\b|\bvideo_analysis\b|\bvision_analysis_frames\b|\binterview_sessions\b|\breports\b|\bmessages\b)/i;
  if (forbiddenTables.test(s)) return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Hybrid auth
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const session = await getServerSession(authOptions);
    let userId = token?.sub || session?.user?.id;

    if (!userId) {
      let sessionToken = request.cookies.get('next-auth.session-token')?.value || request.cookies.get('next-auth.database-session')?.value;
      if (sessionToken) {
        try {
          const dbSession = await prisma.session.findUnique({ where: { sessionToken }, include: { user: true } });
          if (dbSession && dbSession.expires > new Date()) userId = dbSession.userId;
        } catch {}
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const sessionId: string | undefined = body?.sessionId;
    const transcript: string | undefined = body?.conversationTranscript || body?.transcript;
    const jobRole: string | undefined = body?.jobRole;
    const company: string | undefined = body?.company;
    const interviewType: string | undefined = body?.interviewType;

    if (!sessionId || !transcript || String(transcript).trim().length < 20) {
      return NextResponse.json({ error: 'Missing or too-short session transcript' }, { status: 400 });
    }

    const generationConfig = {
      maxOutputTokens: 1200,
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: 'text/plain',
    } as const;

    // Use a trimmed transcript for model context to avoid MAX_TOKENS; inject full transcript later
    const limit = 1800;
    const promptTranscript = String(transcript).length > limit ? String(transcript).slice(0, limit) : String(transcript);
    const prompt = buildSqlPrompt({ sessionId, transcript: promptTranscript, jobRole, company, interviewType });

    let sql: string | null = null;
    let usedModel: string | null = null;
    let usedLocation: string | null = null;
    let lastError: unknown = null;

    for (const loc of LOCATION_CANDIDATES) {
      for (const model of MODEL_CANDIDATES) {
        try {
          const client = loc === DEFAULT_LOCATION ? vertex_ai : new VertexAI({ project: PROJECT_ID, location: loc });
          const generativeModel = client.preview.getGenerativeModel({ model, generationConfig });
          const result = await generativeModel.generateContent(prompt);
          const response: any = result.response;
          let text = '';
          const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined;
          if (Array.isArray(parts) && parts.length) {
            text = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim();
          }
          if (!text && typeof response?.text === 'function') {
            try { const t = response.text(); if (typeof t === 'string') text = t; } catch {}
          }
          debugLog('attempt', { model, loc, finishReason: response?.candidates?.[0]?.finishReason, visibleChars: (text||'').length })
          const extracted = extractSql(text);
          if (extracted && isSafeUpsert(extracted)) {
            // Inject transcript before marking success
            sql = injectTranscript(extracted, transcript);
            usedModel = model;
            usedLocation = loc;
            break;
          }
        } catch (e) {
          lastError = e;
          if (!isModelNotFound(e)) {
            // continue trying other models/regions
          }
        }
      }
      if (sql) break;
    }

    if (!sql) {
      // Second-chance: minimal prompt with gemini-2.5-flash in default region
      try {
        const client = vertex_ai
        const generativeModel = client.preview.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { ...generationConfig, maxOutputTokens: 600, temperature: 0.0, topP: 0.9 },
        })
        const minimal = buildMinimalSqlPrompt(sessionId!, interviewType)
        const result = await generativeModel.generateContent(minimal)
        const response: any = result.response
        let text = ''
        const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined
        if (Array.isArray(parts) && parts.length) {
          text = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim()
        }
        if (!text && typeof response?.text === 'function') {
          try { const t = response.text(); if (typeof t === 'string') text = t } catch {}
        }
        debugLog('minimal-attempt', { model: 'gemini-2.5-flash', loc: DEFAULT_LOCATION, finishReason: response?.candidates?.[0]?.finishReason, visibleChars: (text||'').length })
        const extracted = extractSql(text)
        if (extracted && isSafeUpsert(extracted)) {
          sql = injectTranscript(extracted, transcript)
          usedModel = 'gemini-2.5-flash'
          usedLocation = DEFAULT_LOCATION
        }
      } catch (e) {
        lastError = e
      }
      if (!sql) {
        const detail = lastError instanceof Error ? lastError.message : String(lastError || '')
        return NextResponse.json({ error: 'Model did not return a valid SQL UPSERT', details: detail || 'EMPTY_OUTPUT' }, { status: 502 })
      }
    }

    // Execute the SQL after final validation
    if (!isSafeUpsert(sql)) {
      return NextResponse.json({ error: 'Unsafe SQL rejected' }, { status: 422 });
    }

    try {
      const affected: unknown = await (prisma as any).$executeRawUnsafe(sql);
      // Best-effort: mark session completed if not already (non-blocking)
      try {
        await prisma.interviewSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED', endedAt: new Date() } });
      } catch {}

      return NextResponse.json({ success: true, sessionId, usedModel, usedLocation, affected });
    } catch (execErr) {
      return NextResponse.json({ error: 'Failed to execute generated SQL', details: execErr instanceof Error ? execErr.message : String(execErr) }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Unexpected error', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
