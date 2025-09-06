// Test script to directly call Gemini with our SQL prompt and see the raw response
require('dotenv').config({ path: '.env.local' });
const { VertexAI } = require('@google-cloud/vertexai');

// Debug environment
console.log('Environment check:');
console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('- GOOGLE_CLOUD_PROJECT exists:', !!process.env.GOOGLE_CLOUD_PROJECT);
console.log('- GOOGLE_CLOUD_PROJECT_ID exists:', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
console.log('- GOOGLE_APPLICATION_CREDENTIALS exists:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('- VERTEX_GEMINI_MODEL exists:', !!process.env.VERTEX_GEMINI_MODEL);
console.log('- VERTEX_LOCATIONS exists:', !!process.env.VERTEX_LOCATIONS);

// Initialize Vertex AI
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419';
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
console.log(`Using project: ${PROJECT_ID}, location: ${DEFAULT_LOCATION}`);

let vertex_ai;
try {
  vertex_ai = new VertexAI({ project: PROJECT_ID, location: DEFAULT_LOCATION });
  console.log('VertexAI client initialized successfully');
} catch (error) {
  console.error('Failed to initialize VertexAI client:', error);
  process.exit(1);
}

// Sample transcript for testing
const SAMPLE_TRANSCRIPT = `
Interviewer: Tell me about a time you had to make a difficult decision.
Candidate: In my previous role at XYZ Corp, I was leading a team of 5 developers on a critical project. We were approaching a major deadline, and I discovered that one of our core features had significant security vulnerabilities. I had to decide whether to delay the launch to fix the issues or proceed with the planned release. After consulting with the security team and stakeholders, I made the difficult decision to delay the launch by two weeks. This allowed us to address the vulnerabilities properly. While this initially disappointed some stakeholders, I communicated transparently about the risks and our mitigation plan. Ultimately, this decision was validated when we launched a secure product that received positive feedback from our security auditors.
Interviewer: How did you handle the team's reaction to this delay?
Candidate: I approached this with complete transparency. I called an emergency team meeting to explain the situation, the security risks, and why we needed to pivot. I acknowledged their hard work and emphasized that the delay wasn't a reflection of their performance. To maintain morale, I reorganized our sprint planning to ensure the additional work was distributed fairly. I also negotiated with management to provide some comp time after the launch to recognize the team's extra efforts. Throughout the delay period, I held daily check-ins to address concerns and celebrate progress. This approach kept the team motivated, and we actually delivered the fixes faster than initially estimated.
`;

// Build the SQL prompt (simplified version of what's in the API route)
function buildSqlPrompt(sessionId, transcript) {
  const nowIso = new Date().toISOString();
  return [
    'Role: You are a data formatter that outputs a single PostgreSQL SQL statement to insert or update interview feedback.',
    '',
    'Input you will receive:',
    `SESSION_ID: ${sessionId}`,
    `FULL_TRANSCRIPT: ${transcript}`,
    'CONTEXT: jobRole=Software Engineer; company=FAANG; interviewType=behavioral',
    '',
    'Optional metrics you infer from the transcript:',
    'CLARITY_SCORE_10: integer 0–10',
    'SPEAKING_PACE_WPM: integer (words per minute)',
    'FILLER_WORD_COUNT: integer',
    '',
    'Target table & columns (PostgreSQL):',
    'interview_feedback("sessionId","transcript","contentFeedback","processingMetadata","clarityScore","speakingPaceWpm","fillerWordCount","emotionTimeline","updatedAt")',
    '',
    'Output contract (must follow exactly):',
    'Return only one SQL statement (no prose, no Markdown, no code fences).',
    'Use dollar-quoted strings for long text/JSON to avoid escaping issues:',
    '$t$ ... $t$ for transcript,',
    '$j$ ... $j$ for contentFeedback (minified JSON),',
    '$m$ ... $m$ for processingMetadata (minified JSON).',
    'Minify all JSON (no newlines or spaces beyond those required in strings).',
    'Populate numbers as integers. If a metric is unknown, use 0 (not NULL) for numeric columns and [] for emotionTimeline to satisfy NOT NULL constraints.',
    'Provide overallScore10 both at the top level of contentFeedback and inside analysis.overallScore10 (backward-compat).',
    'Use UPSERT: INSERT ... ON CONFLICT ("sessionId") DO UPDATE SET ... updating all fields except "sessionId".',
    '',
    'contentFeedback JSON shape (example – minify in output):',
    '{"overallScore10":7,"rubric":{"content":7,"structure":6,"delivery":7},"strengths":["Clear problem framing","Good STAR examples"],"areasToImprove":["Shorten answers","Quantify impact more"],"fillerWords":{"count":14,"top":[["um",6],["like",5],["you know",3]]},"turns":[{"q":"Tell me about yourself","aExcerpt":"...","notes":"Good hook; trim length","score10":7},{"q":"Product metrics you track?","aExcerpt":"...","notes":"Add retention cohorts","score10":6}],"analysis":{"overallScore10":7,"speakingPaceWpm":142,"clarityScore10":7,"recommendations":[{"tip":"Use concrete numbers in first 60s","impact":"high"},{"tip":"Pause 1s before answering","impact":"medium"}]}}',
    '',
    'processingMetadata JSON shape (example – minify in output):',
    `{"model":"gemini-1.5-flash","promptVersion":"ifb-sql-v1","scaleNotes":"scores are 0-10 integers","source":"wingman-interview","generatedAt":"${nowIso}"}`,
    '',
    'Formatting rules for metrics:',
    'clarityScore = CLARITY_SCORE_10 * 10 (0–100 integer).',
    'speakingPaceWpm = SPEAKING_PACE_WPM (integer).',
    'fillerWordCount = FILLER_WORD_COUNT (integer).',
    'If you do not infer a numeric metric, insert 0 for that column.',
    'Set emotionTimeline to a JSON string of [] when unknown (must be a TEXT value containing the JSON string for an empty array).',
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
    'Ensure dollar-quote delimiters don\'t appear inside their bodies; if they do, switch delimiters and keep them consistent.',
    'Ensure integers are numeric (no quotes).',
    'Ensure both overallScore10 (top level) and analysis.overallScore10 are present and equal.'
  ].join('\n');
}

// Function to extract SQL from response
function extractSql(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  // Remove code fences and labels
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

// Function to check if SQL is a safe UPSERT
function isSafeUpsert(sql) {
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

// Test with multiple models
async function testModels() {
  const sessionId = 'test-session-' + Date.now();
  const prompt = buildSqlPrompt(sessionId, SAMPLE_TRANSCRIPT);
  
  console.log('🔍 Testing SQL prompt with Gemini models...\n');
  
  // Use only gemini-2.5-flash model
  const models = [
    'gemini-2.5-flash'
  ];
  
  // Use only us-central1 location
  const locations = ['us-central1'];
  
  let success = false;
  
  for (const location of locations) {
    if (success) break;
    
    console.log(`\n🌎 Testing location: ${location}`);
    let client;
    
    try {
      client = location === DEFAULT_LOCATION 
        ? vertex_ai 
        : new VertexAI({ project: PROJECT_ID, location });
    } catch (error) {
      console.error(`Failed to initialize VertexAI client for ${location}:`, error);
      continue;
    }
    
    for (const model of models) {
    try {
      console.log(`\n📝 Testing model: ${model} in ${location}`);
      
      const generationConfig = {
        maxOutputTokens: 1200,
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: 'text/plain',
      };
      
      const generativeModel = client.preview.getGenerativeModel({
        model: model,
        generationConfig,
      });
      
      console.log('Sending prompt to Vertex AI...');
      console.time('Gemini response time');
      const result = await generativeModel.generateContent(prompt);
      console.timeEnd('Gemini response time');
      const response = result.response;
      
      // Extract text from response
      let text = '';
      const parts = response?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts) && parts.length) {
        text = parts
          .map(p => (p && typeof p.text === 'string' ? p.text : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
      }
      
      if (!text && typeof response?.text === 'function') {
        try { text = response.text(); } catch {}
      }
      
      console.log('\n✅ Got response:');
      console.log('-------------------');
      console.log(text.substring(0, 500) + (text.length > 500 ? '...' : ''));
      console.log('-------------------');
      
      // Extract and validate SQL
      const sql = extractSql(text);
      if (sql) {
        console.log('\n🔍 Extracted SQL:');
        console.log('-------------------');
        console.log(sql);
        console.log('-------------------');
        
        const isSafe = isSafeUpsert(sql);
        console.log(`\n🛡️ SQL is ${isSafe ? 'SAFE' : 'UNSAFE'} for execution`);
        
        if (!isSafe) {
          console.log('❌ Failed safety checks');
        }
      } else {
        console.log('\n❌ Could not extract valid SQL from response');
      }
      
      // Success with this model, no need to try others
      success = true;
      break;
      
    } catch (error) {
      console.error(`❌ Error with model ${model} in ${location}:`, error);
      if (error.message && error.message.includes('NOT_FOUND')) {
        console.log(`Model ${model} not available in ${location}`);
      }
      if (error.message && error.message.includes('PERMISSION_DENIED')) {
        console.log(`Permission denied for model ${model} in ${location}`);
      }
    }
    }
  }
  
  if (!success) {
    console.log('\n❌ Failed to get a successful response from any model/location combination');
  }
}

// Run the test
testModels().catch(error => {
  console.error('Unhandled error in test:', error);
  process.exit(1);
});
