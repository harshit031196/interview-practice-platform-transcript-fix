// Generate numeric-only interview feedback via Gemini 2.5 Flash and upsert into DB
// Fields: overallPerformance10, clarityOfThought10, structure10, delivery10
// Maps clarityOfThought10 -> clarityScore (0-100) while speakingPaceWpm/fillerWordCount optional
// Usage:
//   node scripts/generate-feedback-quant.js --session <SESSION_ID> [--interviewType behavioral] [--dry]
// After running, you can inspect raw content via:
//   node scripts/print-raw-feedback.js --session <SESSION_ID>

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { VertexAI } = require('@google-cloud/vertexai');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

function parseArgs(argv) {
  const out = { session: null, interviewType: 'behavioral', dry: false, maxChars: 1200, chunkSize: 400 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--session' || a === '-s') && argv[i + 1]) { out.session = argv[++i]; continue; }
    if ((a === '--interviewType' || a === '--type') && argv[i + 1]) { out.interviewType = argv[++i]; continue; }
    if (a === '--dry') { out.dry = true; continue; }
    if (a === '--max-chars' && argv[i + 1]) { const n = Number(argv[++i]); if (isFinite(n) && n > 100) out.maxChars = Math.floor(n); continue; }
    if (a === '--chunk-size' && argv[i + 1]) { const n = Number(argv[++i]); if (isFinite(n) && n >= 200 && n <= 1000) out.chunkSize = Math.floor(n); continue; }
  }
  return out;
}

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL = 'gemini-2.5-flash';

function buildQuantSqlPrompt({ sessionId, transcript, jobRole = 'Software Engineer', company = 'FAANG', interviewType = 'behavioral' }) {
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
    'DELIVERY_10: integer 0–10',
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
    'contentFeedback must contain ONLY numeric fields and no narrative. Use EXACT keys: overallPerformance10, clarityOfThought10, structure10, delivery10.',
    'Use UPSERT: INSERT ... ON CONFLICT ("sessionId") DO UPDATE SET ... updating all fields except "sessionId".',
    '',
    'contentFeedback JSON shape (example – minify in output):',
    '{"overallPerformance10":7,"clarityOfThought10":7,"structure10":6}',
    '',
    'processingMetadata JSON shape (example – minify in output):',
    `{"model":"${MODEL}","promptVersion":"ifb-quant-v1","scaleNotes":"scores are 0-10 integers","source":"wingman-interview","generatedAt":"${nowIso}","metricKeys":["overallPerformance10","clarityOfThought10","structure10"]}`,
    '',
    'Formatting rules for metrics:',
    'clarityScore = CLARITY_OF_THOUGHT_10 * 10 (0–100 integer).',
    'speakingPaceWpm = SPEAKING_PACE_WPM (integer; 0 if unknown).',
    'fillerWordCount = FILLER_WORD_COUNT (integer; 0 if unknown).',
    'If you do not infer a numeric metric, insert 0 for that column.',
    'Set emotionTimeline to a JSON string of [] when unknown (i.e., "[]").',
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
  ].join('\n');
}

function extractSql(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  t = t.replace(/```\s*sql\s*/gi, '').replace(/```/g, '').trim();
  const upper = t.toUpperCase();
  let startIdx = upper.indexOf('INSERT INTO INTERVIEW_FEEDBACK');
  if (startIdx === -1) startIdx = upper.indexOf('INSERT INTO "INTERVIEW_FEEDBACK"');
  if (startIdx === -1) startIdx = upper.indexOf('INSERT INTO PUBLIC.INTERVIEW_FEEDBACK');
  if (startIdx === -1) startIdx = upper.indexOf('INSERT INTO PUBLIC."INTERVIEW_FEEDBACK"');
  if (startIdx === -1) return null;
  return t.slice(startIdx).trim();
}

function isSafeUpsert(sql) {
  const s = sql.trim();
  if (!/^INSERT\s+INTO\s+(?:"?public"?\.)?"?interview_feedback"?\s*\(/i.test(s)) return false;
  if (!/ON\s+CONFLICT\s*\(\s*"sessionId"\s*\)\s*DO\s+UPDATE\s+SET/i.test(s)) return false;
  if (/(DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)\b/i.test(s)) return false;
  if (/(;\s*--|\/\*)/.test(s)) return false;
  const forbiddenTables = /(\busers\b|\bvideo_analysis\b|\bvision_analysis_frames\b|\binterview_sessions\b|\breports\b|\bmessages\b)/i;
  if (forbiddenTables.test(s)) return false;
  return true;
}

function injectTranscript(sql, transcript) {
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = sql.match(/(\$[a-zA-Z]*\$)FULL_TRANSCRIPT\1/);
  if (!m) return sql;
  let delim = m[1];
  if (transcript.includes(delim)) {
    const candidates = ['$tt$', '$tx$', '$tm$', '$t1$', '$tq$'];
    const pick = candidates.find((d) => !transcript.includes(d) && !sql.includes(d)) || '$tt$';
    const oldBlock = new RegExp(`${escapeRegExp(delim)}FULL_TRANSCRIPT${escapeRegExp(delim)}`);
    sql = sql.replace(oldBlock, `${pick}FULL_TRANSCRIPT${pick}`);
    delim = pick;
  }
  const blockRe = new RegExp(`${escapeRegExp(delim)}FULL_TRANSCRIPT${escapeRegExp(delim)}`);
  return sql.replace(blockRe, `${delim}${transcript}${delim}`);
}

function extractTranscriptFromAny(obj) {
  try {
    if (!obj || typeof obj !== 'object') return null;
    const p = (...ks) => ks.reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), obj);
    const candidates = [
      p('videoAnalysis', 'speechTranscription', 'transcript'),
      p('speech_analysis', 'transcript'),
      p('speechAnalysis', 'transcript'),
      p('results', 'speech_analysis', 'transcript'),
      p('analysisData', 'videoAnalysis', 'speechTranscription', 'transcript'),
      obj.transcript,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length >= 20) return c.trim();
    }
  } catch {}
  return null;
}

async function assembleTranscript(sessionId) {
  // 1) Preferred: transcript_items
  const items = await prisma.transcriptItem.findMany({ where: { sessionId }, orderBy: { t: 'asc' } });
  if (items && items.length > 0) {
    const lines = items.map((it) => `${it.speaker === 'AI' ? 'Interviewer' : 'Candidate'}: ${it.text}`);
    const joined = lines.join('\n').trim();
    if (joined.length >= 20) return joined;
  }

  // 2) Fallback: interview_feedback.transcript if present
  try {
    const fb = await prisma.interviewFeedback.findUnique({ where: { sessionId }, select: { transcript: true } });
    if (fb && typeof fb.transcript === 'string' && fb.transcript.trim().length >= 20) {
      return fb.transcript.trim();
    }
  } catch {}

  // 3) Fallback: video_analysis results JSON
  try {
    const vas = await prisma.videoAnalysis.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
    for (const va of vas) {
      if (typeof va.results === 'string' && va.results.trim()) {
        try {
          const parsed = JSON.parse(va.results);
          const t = extractTranscriptFromAny(parsed);
          if (t) return t;
        } catch {}
      }
    }
  } catch {}

  return '';
}

async function getMetricsJson(vertexAi, { session, interviewType, transcript }) {
  const prompt = [
    'You are an evaluator. Read the interview transcript and return ONLY a strict JSON object with 3 integer metrics, no text around it.',
    'Keys (integers 0-10): overallPerformance10, clarityOfThought10, structure10.',
    'Optional integers: speakingPaceWpm (0 if unknown), fillerWordCount (0 if unknown).',
    'Do not include explanations or narrative. Return only JSON.',
    '',
    `SESSION_ID: ${session}`,
    `INTERVIEW_TYPE: ${interviewType}`,
    'TRANSCRIPT:',
    transcript,
  ].join('\n');
  const generativeModel = vertexAi.preview.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: 128,
      temperature: 0.0,
      topP: 0.9,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          overallPerformance10: { type: 'integer' },
          clarityOfThought10: { type: 'integer' },
          structure10: { type: 'integer' },
          speakingPaceWpm: { type: 'integer' },
          fillerWordCount: { type: 'integer' }
        },
        required: ['overallPerformance10', 'clarityOfThought10', 'structure10'],
        additionalProperties: false
      }
    }
  });
  const res = await generativeModel.generateContent(prompt);
  const finish = res.response?.candidates?.[0]?.finishReason;
  // Try response.text() first in JSON mode
  let txt = '';
  try { txt = typeof res.response?.text === 'function' ? res.response.text() : ''; } catch {}
  if (!txt) {
    const parts = res.response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      txt = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim();
    }
  }
  console.log('[QuantFeedback][JSON] finishReason=', finish, 'visibleChars=', (txt||'').length);
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

function clampInt(n, lo, hi) { n = Math.round(Number(n) || 0); return Math.max(lo, Math.min(hi, n)); }

function buildSqlFromMetrics(sessionId, transcript, metrics) {
  const overall = clampInt(metrics.overallPerformance10, 0, 10);
  const clarity10 = clampInt(metrics.clarityOfThought10, 0, 10);
  const structure10 = clampInt(metrics.structure10, 0, 10);
  const speaking = clampInt(metrics.speakingPaceWpm ?? 0, 0, 1000);
  const filler = clampInt(metrics.fillerWordCount ?? 0, 0, 10000);
  const clarity100 = clarity10 * 10;
  const content = JSON.stringify({ overallPerformance10: overall, clarityOfThought10: clarity10, structure10 });
  const meta = JSON.stringify({ model: MODEL, promptVersion: 'ifb-quant-json-v1', source: 'wingman-interview', generatedAt: new Date().toISOString(), metricKeys: ['overallPerformance10','clarityOfThought10','structure10'] });
  return [
    'INSERT INTO interview_feedback',
    '("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
    'VALUES',
    '(',
    `  '${sessionId}',`,
    '  $t$FULL_TRANSCRIPT$t$,',
    `  $j${content}$j$,`,
    `  $m${meta}$m$,`,
    `  ${clarity100},`,
    `  ${speaking},`,
    `  ${filler},`,
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
    '  "updatedAt" = NOW();'
  ].join('\n');
}

async function main() {
  const { session, interviewType, dry, maxChars, chunkSize } = parseArgs(process.argv);
  if (!session) {
    console.error('Missing --session <SESSION_ID>');
    process.exit(1);
  }

  console.log(`[QuantFeedback] Project=${PROJECT_ID}, Location=${LOCATION}, Model=${MODEL}`);
  const transcript = await assembleTranscript(session);
  if (!transcript || transcript.trim().length < 20) {
    console.error('[QuantFeedback] No transcript found or too short for this session.');
    process.exit(2);
  }
  const limit = Math.max(600, Math.min(4000, Number(maxChars) || 1200));
  const trimmed = transcript.length > limit ? transcript.slice(0, limit) : transcript;
  if (trimmed.length !== transcript.length) {
    console.log(`[QuantFeedback] Transcript trimmed to ${trimmed.length} chars for token budget (limit=${limit})`);
  }

  const vertexAi = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  const generationConfig = {
    maxOutputTokens: 1200,
    temperature: 0.1,
    topP: 0.8,
    responseMimeType: 'text/plain',
  };

  // 1) Try JSON metrics mode (preferred)
  console.log('[QuantFeedback] Requesting numeric metrics (JSON mode)...');
  let sql = null;
  let metrics = null;
  try {
    metrics = await getMetricsJson(vertexAi, { session, interviewType, transcript: trimmed });
  } catch (e) {
    console.warn('[QuantFeedback] JSON metrics attempt failed:', e?.message || String(e));
  }
  if (metrics && typeof metrics === 'object') {
    sql = buildSqlFromMetrics(session, trimmed, metrics);
  }

  // 2) If JSON metrics path fails, try direct SQL generation
  if (!sql) {
    const prompt = buildQuantSqlPrompt({ sessionId: session, transcript: trimmed, interviewType });
    console.log('[QuantFeedback] JSON mode failed; sending SQL prompt to model...');
    const generativeModel = vertexAi.preview.getGenerativeModel({ model: MODEL, generationConfig });
    try {
      const result = await generativeModel.generateContent(prompt);
      const response = result.response;
      const parts = response?.candidates?.[0]?.content?.parts;
      let text = '';
      if (Array.isArray(parts) && parts.length) {
        text = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim();
      }
      if (!text && typeof response?.text === 'function') {
        try { text = response.text(); } catch {}
      }
      console.log('[QuantFeedback] finishReason=', response?.candidates?.[0]?.finishReason, 'visibleChars=', (text || '').length);
      const extracted = extractSql(text);
      if (extracted && isSafeUpsert(extracted)) {
        sql = injectTranscript(extracted, trimmed);
      }
    } catch (err) {
      console.warn('[QuantFeedback] First attempt failed:', err?.message || String(err));
    }
  }

  // Minimal fallback
  if (!sql) {
    // 2.5) Try chunked JSON metrics averaging before minimal SQL
    console.log('[QuantFeedback] Trying chunked JSON metrics averaging...');
    const chunks = [];
    const size = Math.max(200, Math.min(1000, Number(chunkSize) || 400));
    for (let i = 0; i < trimmed.length; i += size) {
      chunks.push(trimmed.slice(i, i + size));
    }
    const perChunk = [];
    for (const [idx, ch] of chunks.entries()) {
      try {
        const m = await getMetricsJson(vertexAi, { session, interviewType, transcript: ch });
        if (m && typeof m === 'object') perChunk.push(m);
        console.log(`[QuantFeedback] chunk ${idx+1}/${chunks.length} =>`, m ? 'ok' : 'empty');
      } catch (e) {
        console.warn(`[QuantFeedback] chunk ${idx+1} failed:`, e?.message || String(e));
      }
    }
    if (perChunk.length) {
      const avg = (arr) => Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);
      const overalls = perChunk.map(m => clampInt(m.overallPerformance10, 0, 10));
      const claritys = perChunk.map(m => clampInt(m.clarityOfThought10, 0, 10));
      const structs = perChunk.map(m => clampInt(m.structure10, 0, 10));
      const speakings = perChunk.map(m => clampInt(m.speakingPaceWpm ?? 0, 0, 1000));
      const fillers = perChunk.map(m => clampInt(m.fillerWordCount ?? 0, 0, 10000));
      const agg = {
        overallPerformance10: avg(overalls),
        clarityOfThought10: avg(claritys),
        structure10: avg(structs),
        speakingPaceWpm: avg(speakings),
        fillerWordCount: avg(fillers)
      };
      sql = buildSqlFromMetrics(session, trimmed, agg);
    }
  }

  // Minimal fallback
  if (!sql) {
    const nowIso = new Date().toISOString();
    const minimal = [
      'Return ONLY one SQL UPSERT for PostgreSQL to insert/update the interview_feedback row.',
      'Rules:',
      '- Begin with INSERT INTO interview_feedback and end with a semicolon.',
      '- Use the exact column list: ("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
      '- Use dollar-quoted strings:',
      '  $t$FULL_TRANSCRIPT$t$ for transcript (exact token FULL_TRANSCRIPT).',
      '  $j${minified JSON}$j$ for contentFeedback.',
      '  $m${minified JSON}$m$ for processingMetadata.',
      '- JSON must be minified (no spaces/newlines).',
      '- contentFeedback must contain ONLY numeric keys: overallPerformance10, clarityOfThought10, structure10, delivery10.',
      '- Use ON CONFLICT ("sessionId") DO UPDATE SET to upsert all fields.',
      '- Use NOW() for updatedAt.',
      '- If metrics are unknown, set clarityScore=0, speakingPaceWpm=0, fillerWordCount=0 and emotionTimeline to "[]".',
      '',
      'Values to use:',
      `- sessionId='${session}'`,
      `- interviewType='${interviewType}'`,
      `- processingMetadata: {"model":"${MODEL}","promptVersion":"ifb-quant-min-v1","source":"wingman-interview","generatedAt":"${nowIso}","metricKeys":["overallPerformance10","clarityOfThought10","structure10","delivery10"]}`,
      `- contentFeedback: {"overallPerformance10":0,"clarityOfThought10":0,"structure10":0}`,
    ].join('\n');

    try {
      const gm = vertexAi.preview.getGenerativeModel({ model: MODEL, generationConfig: { ...generationConfig, maxOutputTokens: 256, temperature: 0.0, topP: 0.9 } });
      const result = await gm.generateContent(minimal);
      const response = result.response;
      const parts = response?.candidates?.[0]?.content?.parts;
      let text = '';
      if (Array.isArray(parts) && parts.length) {
        text = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim();
      }
      if (!text && typeof response?.text === 'function') {
        try { text = response.text(); } catch {}
      }
      console.log('[QuantFeedback] minimal finishReason=', response?.candidates?.[0]?.finishReason, 'visibleChars=', (text || '').length);
      const extracted = extractSql(text);
      if (extracted && isSafeUpsert(extracted)) {
        sql = injectTranscript(extracted, trimmed);
      }
    } catch (err) {
      console.warn('[QuantFeedback] Minimal attempt failed:', err?.message || String(err));
    }
  }

  if (!sql) {
    console.error('[QuantFeedback] Failed to obtain a valid SQL UPSERT from the model.');
    process.exit(3);
  }

  console.log('\n=== SQL to execute ===');
  console.log(sql);

  if (dry) {
    console.log('\n[QuantFeedback] --dry specified, not executing.');
    return;
  }

  try {
    const affected = await prisma.$executeRawUnsafe(sql);
    console.log(`\n[QuantFeedback] Upsert executed. Affected: ${affected}`);
  } catch (execErr) {
    console.error('[QuantFeedback] Execution error:', execErr?.message || String(execErr));
    process.exit(4);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { try { await prisma.$disconnect(); } catch {} });
