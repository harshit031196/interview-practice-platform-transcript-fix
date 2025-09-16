import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VertexAI } from '@google-cloud/vertexai';
 
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vertex AI project/location config (client will be created lazily inside handlers)
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419';
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

// Allow overriding model via env vars; try multiple fallbacks if unavailable
const ENV_MODEL = process.env.VERTEX_GEMINI_MODEL || process.env.GEMINI_MODEL;
const MODEL_CANDIDATES: string[] = [
  ENV_MODEL,
  'gemini-2.5-flash',
  'gemini-1.5-pro-002',
  'gemini-1.5-flash-002',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
].filter(Boolean) as string[];

// Candidate locations to try; configurable via env.
// - VERTEX_LOCATIONS: comma-separated list, e.g. "us-central1,us-east5"
// - VERTEX_ALLOW_FALLBACK_REGIONS=true to include a minimal default fallback set
const ENV_LOCATIONS = (process.env.VERTEX_LOCATIONS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOW_FALLBACK_REGIONS = String(process.env.VERTEX_ALLOW_FALLBACK_REGIONS).toLowerCase() === 'true';
const LOCATION_CANDIDATES: string[] = ENV_LOCATIONS.length
  ? ENV_LOCATIONS
  : [DEFAULT_LOCATION, ...(ALLOW_FALLBACK_REGIONS ? ['us-east5'] : [])];

const isModelNotFound = (err: any): boolean => {
  const code = err?.code ?? err?.status;
  const msg = (err?.message || '').toString();
  return code === 404 || /NOT_FOUND/i.test(String(err?.status)) || /was not found|Publisher Model/i.test(msg);
}

// Determine the effective job role for feedback prompts based on interview type
function effectiveRoleFromType(interviewType: string, incomingRole?: string): string {
  const t = (interviewType || '').toLowerCase().replace(/\s+/g, '-');
  if (t === 'product') return 'Product Manager';
  if (t === 'technical' || t === 'system-design') return 'Software Engineer';
  // Behavioral supports both; honor explicit incoming role if provided
  const r = (incomingRole || '').toLowerCase();
  if (/product\s*manager|\bpm\b/.test(r)) return 'Product Manager';
  if (/software\s*(engineer|developer)|\bswe\b|\bsde\b/.test(r)) return 'Software Engineer';
  return 'Software Engineer or Product Manager';
}

// Build 5 key metrics expected for different interview types
function metricNamesForType(interviewType: string): string[] {
  const type = (interviewType || '').toLowerCase();
  if (type.includes('product')) {
    return [
      'Answer Structure',
      'Clarity of Thought',
      'User Understanding & Insights',
      'Prioritization & Trade-offs',
      'Impact & Metrics Orientation'
    ];
  }
  if (type.includes('system')) {
    return [
      'Requirements & Constraints',
      'High-level Architecture',
      'Scalability & Reliability',
      'Trade-offs & Alternatives',
      'Bottlenecks & Mitigations'
    ];
  }
  if (type.includes('technical')) {
    return [
      'Correctness',
      'Problem-Solving Approach',
      'Complexity & Efficiency',
      'Code/Communication Clarity',
      'Testing & Edge Cases'
    ];
  }
  // behavioral default
  return [
    'STAR Method Usage',
    'Clarity & Structure',
    'Conciseness',
    'Impact & Outcomes',
    'Leadership/Teamwork'
  ];
}

export async function POST(request: NextRequest) {
  try {
    console.log('[API] POST /api/ai/feedback - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
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
      console.error('[API] Unauthorized AI feedback request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for AI feedback: ${userId}`);

    const body = await request.json();
    const { 
      conversationTranscript, 
      conversationHistory = [],
      jobRole: incomingJobRole = 'Software Engineer',
      company = 'FAANG',
      interviewType = 'behavioral',
      sessionId 
    } = body;

    const effectiveJobRole = effectiveRoleFromType(interviewType, incomingJobRole);

    // Construct transcript if not provided, using conversationHistory
    let transcriptText: string | null = conversationTranscript || null;
    if (!transcriptText && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      try {
        transcriptText = conversationHistory
          .map((m: any) => {
            const role = m.role === 'assistant' ? 'Interviewer' : 'Candidate';
            const content = typeof m.content === 'string' ? m.content : '';
            return `${role}: ${content}`;
          })
          .join('\n');
      } catch {
        transcriptText = null;
      }
    }
    if (!transcriptText) {
      return NextResponse.json({ error: 'No conversation content provided' }, { status: 400 });
    }

    // Log a safe preview of the transcript (conversationTranscript may be undefined)
    console.log('Generating feedback for transcript:', (transcriptText || '').substring(0, 200) + '...');

    // Numbers-only prompt for simplified output
    const metricList = metricNamesForType(interviewType);
    const systemPrompt = `You are an expert interview coach analyzing a ${interviewType} interview conversation for a ${effectiveJobRole} at ${company}.

Return ONLY a strict JSON object (no markdown, no wrapping text) with the following schema:
{
  "overallScore10": integer 0-10,
  "interviewType": string,
  "metrics": [
    { "name": "${metricList[0]}", "score10": integer 0-10, "explanation": string },
    { "name": "${metricList[1]}", "score10": integer 0-10, "explanation": string },
    { "name": "${metricList[2]}", "score10": integer 0-10, "explanation": string },
    { "name": "${metricList[3]}", "score10": integer 0-10, "explanation": string },
    { "name": "${metricList[4]}", "score10": integer 0-10, "explanation": string }
  ],
  "mistakes": [
    { "quote": string, "whyItMatters": string, "fix": string }
  ],
  "summary": string,
  "nextSteps": [string]
}

Rules and calibration:
- Use this scoring rubric for all score10 values (including overall):
  - 9–10 Outstanding: clear evidence throughout; precise, confident, and complete.
  - 7–8 Strong: generally clear with minor gaps.
  - 5–6 Acceptable: mixed but adequate; do not over-penalize minor fillers or brief pauses.
  - 3–4 Below average: several issues or missing elements.
  - 0–2 Poor: largely missing, incorrect, or incoherent.
- Consider interview type (behavioral/technical/system/product) when judging structure and technical depth.
- Weigh both strengths and weaknesses; if content is limited but not wrong, stay around 5–7 unless clearly poor.
- Values must be concise but specific to the conversation.
- Explanations should cite what in the conversation supports the score.
- Do NOT include any extra keys, text, or markdown fences.
`;

    // Generate AI feedback using Gemini with model fallback
    const generationConfig = {
      maxOutputTokens: 900,
      temperature: 0.15,
      topP: 0.8,
      // Request JSON for structured analysis
      responseMimeType: 'application/json',
    };

    const prompt = `${systemPrompt}\n\nInterview Transcript (Interviewer/Candidate format):\n${transcriptText}`;

    // Helpers to robustly extract JSON from model outputs that may include code fences or extra text
    const normalizeModelTextToJsonString = (s: string): string => {
      if (!s) return s;
      let t = String(s).trim();
      // Remove code fences like ```json ... ```
      t = t.replace(/```\s*json\s*/gi, '').replace(/```/g, '');
      // If the model prefixed with 'json' or similar labels, drop them
      t = t.replace(/^json\s*:/i, '').trim();
      // Normalize smart quotes to ASCII
      t = t
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
      // Replace raw newlines with spaces to avoid invalid JSON strings
      t = t.replace(/\r?\n/g, ' ');
      // Isolate the outermost JSON object braces
      const first = t.indexOf('{');
      const last = t.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        t = t.slice(first, last + 1);
      }
      return t.trim();
    };

    let aiResponse: string | null = null;
    let usedModelName: string | null = null;
    let usedLocation: string | null = null;
    let lastError: unknown = null;

    // Try multiple regions and models
    for (const loc of LOCATION_CANDIDATES) {
      for (const candidate of MODEL_CANDIDATES) {
        try {
          console.log(`[API] Trying Gemini model: ${candidate} in ${loc}`);
          const client = new VertexAI({ project: PROJECT_ID, location: loc });
          const generativeModel = client.preview.getGenerativeModel({
            model: candidate,
            generationConfig,
          });
          const result = await generativeModel.generateContent(prompt);
          const response = result.response;

          // Robust extraction of text/JSON for this attempt
          let extracted: string | null = null;
          const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined;
          if (Array.isArray(parts) && parts.length > 0) {
            const joined = parts
              .map(p => (p && typeof p.text === 'string' ? p.text : ''))
              .filter(Boolean)
              .join(' ')
              .trim();
            if (joined) extracted = joined;
          }
          if (!extracted && typeof (response as any)?.text === 'function') {
            try {
              const txt = (response as any).text();
              if (typeof txt === 'string' && txt.trim()) extracted = txt;
            } catch {}
          }
          if (!extracted && parts && parts[0]?.text) {
            extracted = parts[0].text;
          }
          if (!extracted) {
            extracted = '{"error":"Failed to generate analysis"}';
          }

          aiResponse = (extracted || '').trim();
          usedModelName = candidate;
          usedLocation = loc;
          console.log(`[API] Model succeeded: ${candidate} in ${loc}`);
          break; // success for inner loop
        } catch (err: any) {
          lastError = err;
          const status = err?.status || err?.code || (err instanceof Error ? err.message : String(err));
          if (isModelNotFound(err)) {
            console.debug(`[API] Model ${candidate} not available in ${loc}:`, status);
          } else {
            console.error(`[API] Model ${candidate} failed in ${loc}:`, status);
          }
        }
      }
      if (aiResponse) break; // success for outer loop
    }

    // If still no response, do not synthesize fake numbers here. Leave empty and try strict retry loop below.
    if (!aiResponse) {
      console.error('[API] All Gemini models/regions failed to return text response', lastError);
      aiResponse = '';
      usedModelName = 'local-fallback';
      usedLocation = 'none';
    }
    // Parse JSON analysis
    const extractJson = (s: string): any | null => {
      if (!s) return null
      let t = normalizeModelTextToJsonString(s)
      try {
        const obj = JSON.parse(t)
        return obj && typeof obj === 'object' ? obj : null
      } catch {
        return null
      }
    }
    let analysis = extractJson(aiResponse || '')
    // Strict JSON retry if needed
    if (!analysis) {
      const strictJsonPrompt = `Return ONLY a strict JSON object with the exact keys: overallScore10, interviewType, metrics, mistakes, summary, nextSteps. No markdown. Metrics must be [{name, score10, explanation}] for: ${metricList.join(', ')}. Score ranges 0-10 (integer). Use the same calibration rubric: 9–10 Outstanding, 7–8 Strong, 5–6 Acceptable, 3–4 Below average, 0–2 Poor. Avoid over-penalizing minor fillers.`
      for (const loc of LOCATION_CANDIDATES) {
        for (const candidate of MODEL_CANDIDATES) {
          try {
            console.log(`[API] Strict JSON retry with model ${candidate} in ${loc}`)
            const client = new VertexAI({ project: PROJECT_ID, location: loc })
            const strictModel = client.preview.getGenerativeModel({
              model: candidate,
              generationConfig: { ...generationConfig, responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 900 },
            })
            const result = await strictModel.generateContent(`${strictJsonPrompt}\n\nTranscript:\n${transcriptText}`)
            const response = result.response as any
            let extracted = ''
            const parts = response?.candidates?.[0]?.content?.parts as any[] | undefined
            if (Array.isArray(parts) && parts.length) {
              extracted = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).filter(Boolean).join(' ').trim()
            }
            if (!extracted && typeof response?.text === 'function') {
              try { const txt = response.text(); if (typeof txt === 'string') extracted = txt } catch {}
            }
            if (!extracted && parts && parts[0]?.text) extracted = parts[0].text
            const obj = extractJson(extracted || '')
            if (obj) { analysis = obj; usedModelName = candidate; usedLocation = loc; break }
          } catch (e: any) {
            if (isModelNotFound(e)) {
              console.debug(`[API] Strict JSON retry skipped (model not in ${loc}) for ${candidate}`)
            } else {
              console.warn(`[API] Strict JSON retry failed for ${candidate} in ${loc}:`, e)
            }
          }
        }
        if (analysis) break
      }
    }

    if (!analysis) {
      // Fallback: accept the raw text response and persist it so the UI can render narrative
      const analysisText = (aiResponse || '').trim()
      if (!analysisText) {
        console.warn('[API] Gemini did not return valid JSON analysis and no text to persist; leaving pending')
        return NextResponse.json({ success: false, pending: true, reason: 'MODEL_INVALID_JSON_EMPTY', sessionId }, { status: 202 })
      }
      const normalized = {
        overallScore10: 0,
        interviewType: interviewType || 'general',
        metrics: [] as any[],
        mistakes: [] as any[],
        summary: analysisText.slice(0, 4000),
        nextSteps: [] as any[],
      }
      try {
        if (sessionId) {
          await (prisma as any).interviewFeedback.upsert({
            where: { sessionId },
            update: {
              transcript: transcriptText,
              speakingPaceWpm: 0,
              fillerWordCount: 0,
              clarityScore: 0,
              emotionTimeline: JSON.stringify([]),
              contentFeedback: analysisText, // store raw text
              processingMetadata: JSON.stringify({
                model: usedModelName || MODEL_CANDIDATES[0],
                location: usedLocation || DEFAULT_LOCATION,
                jobRole: effectiveJobRole,
                company,
                interviewType,
                labels: ['Overall', ...metricNamesForType(interviewType)],
                numbersMode: false,
                format: 'text-v1',
                generatedAt: new Date().toISOString()
              })
            },
            create: {
              sessionId,
              transcript: transcriptText,
              speakingPaceWpm: 0,
              fillerWordCount: 0,
              clarityScore: 0,
              emotionTimeline: JSON.stringify([]),
              contentFeedback: analysisText,
              processingMetadata: JSON.stringify({
                model: usedModelName || MODEL_CANDIDATES[0],
                location: usedLocation || DEFAULT_LOCATION,
                jobRole: effectiveJobRole,
                company,
                interviewType,
                labels: ['Overall', ...metricNamesForType(interviewType)],
                numbersMode: false,
                format: 'text-v1',
                generatedAt: new Date().toISOString()
              })
            }
          })
        }
      } catch (e) {
        console.error('[API] Failed to store text analysis fallback:', e)
      }
      return NextResponse.json({ success: true, normalized, analysisText, labels: ['Overall', ...metricNamesForType(interviewType)], sessionId, transcript: transcriptText })
    }

    // Normalize to GeminiFeedback shape expected by frontend
    const coalesce = (...vals: any[]) => vals.find(v => v !== undefined && v !== null)
    const toNum = (val: any): number | null => {
      if (val == null) return null
      if (typeof val === 'number' && isFinite(val)) return val
      if (typeof val === 'string') {
        const m = val.match(/\d+(?:\.\d+)?/)
        if (m) { const n = Number(m[0]); return isFinite(n) ? n : null }
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

    const maybe = (analysis as any).analysis ? (analysis as any).analysis : analysis
    let overallScore10 = toScore10(coalesce(maybe?.overallScore10, maybe?.overall_score_10, maybe?.overallScore, maybe?.overall))
    if (overallScore10 == null && Array.isArray(maybe?.metrics)) {
      const nums = maybe.metrics.map((m: any) => toScore10(coalesce(m?.score10, m?.score))).filter((v: any) => typeof v === 'number')
      if (nums.length) overallScore10 = Math.max(0, Math.min(10, Math.round(nums.reduce((a: number, b: number) => a + b, 0) / nums.length)))
    }
    if (overallScore10 == null) overallScore10 = 0
    const metricsOut = Array.isArray(maybe?.metrics) ? maybe.metrics.map((m: any) => ({
      name: m?.name || '',
      score10: toScore10(coalesce(m?.score10, m?.score)) ?? 0,
      explanation: (m?.explanation || m?.details || m?.reason || '') as string
    })) : []
    const normalized = {
      overallScore10,
      interviewType: typeof maybe?.interviewType === 'string' ? maybe.interviewType : (interviewType || 'general'),
      metrics: metricsOut,
      mistakes: Array.isArray(maybe?.mistakes) ? maybe.mistakes : [],
      summary: (maybe?.summary || '') as string,
      nextSteps: Array.isArray(maybe?.nextSteps) ? maybe.nextSteps : [],
    }

    console.log('AI feedback (text) generated successfully');

    // Persist to InterviewFeedback table (best-effort)
    try {
      if (sessionId) {
        // Determine clarity index per interview type
        const type = (interviewType || '').toLowerCase()
        // Try to derive clarityScore (0-100) from a clarity-like metric or overall
        const clarityNameCandidates = ['Clarity', 'Clarity & Structure', 'Communication Clarity']
        let clarity10 = overallScore10
        for (const m of normalized.metrics) {
          if (clarityNameCandidates.some(n => (m.name || '').toLowerCase().includes(n.toLowerCase()))) { clarity10 = m.score10; break }
        }
        const clarityScore = Math.min(100, Math.max(0, (clarity10 || 0) * 10));
        await (prisma as any).interviewFeedback.upsert({
          where: { sessionId },
          update: {
            transcript: transcriptText,
            speakingPaceWpm: 0,
            fillerWordCount: 0,
            clarityScore: clarityScore || 0,
            emotionTimeline: JSON.stringify([]),
            contentFeedback: JSON.stringify(analysis),
            processingMetadata: JSON.stringify({
              model: usedModelName || MODEL_CANDIDATES[0],
              location: usedLocation || DEFAULT_LOCATION,
              jobRole: effectiveJobRole,
              company,
              interviewType,
              labels: ['Overall', ...metricList],
              numbersMode: false,
              format: 'json-v1',
              generatedAt: new Date().toISOString()
            })
          },
          create: {
            sessionId,
            transcript: transcriptText,
            speakingPaceWpm: 0,
            fillerWordCount: 0,
            clarityScore: clarityScore || 0,
            emotionTimeline: JSON.stringify([]),
            contentFeedback: JSON.stringify(analysis),
            processingMetadata: JSON.stringify({
              model: usedModelName || MODEL_CANDIDATES[0],
              location: usedLocation || DEFAULT_LOCATION,
              jobRole: effectiveJobRole,
              company,
              interviewType,
              labels: ['Overall', ...metricList],
              numbersMode: false,
              format: 'json-v1',
              generatedAt: new Date().toISOString()
            })
          }
        })
      }
    } catch (dbErr) {
      console.error('[API] Failed to store InterviewFeedback:', dbErr);
    }

    return NextResponse.json({
      success: true,
      normalized,
      analysis,
      labels: ['Overall', ...metricList],
      sessionId,
      transcript: transcriptText
    });

  } catch (error) {
    console.error('[API] Error generating feedback:', error);
    return NextResponse.json(
      { error: 'Failed to generate feedback', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Get existing feedback for a session
export async function GET(request: NextRequest) {
  try {
    console.log('[API] GET /api/ai/feedback - Checking authentication');
    
    // Try to get user from JWT token first
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    
    // Then try to get user from database session
    const session = await getServerSession(authOptions);
    
    // Get user ID from either JWT token or session
    let userId = token?.sub || session?.user?.id;
    
    // If no JWT or session, check for database session directly
    if (!userId) {
      // Check standard session token first
      let sessionToken = request.cookies.get('next-auth.session-token')?.value;
      
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
      console.error('[API] Unauthorized AI feedback request - no valid session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[API] User authenticated for AI feedback: ${userId}`);

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // TODO: Implement database retrieval of stored feedback
    // For now, return placeholder
    return NextResponse.json({
      message: 'Feedback retrieval not yet implemented',
      sessionId
    });

  } catch (error) {
    console.error('[API] Get feedback error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve feedback', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
