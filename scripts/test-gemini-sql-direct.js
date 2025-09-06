// Test script to directly call Gemini 2.5 Flash with SQL prompt
require('dotenv').config({ path: '.env.local' });
const { VertexAI } = require('@google-cloud/vertexai');

// Debug environment
console.log('Environment check:');
console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('- GOOGLE_CLOUD_PROJECT exists:', !!process.env.GOOGLE_CLOUD_PROJECT);
console.log('- GOOGLE_CLOUD_PROJECT_ID exists:', !!process.env.GOOGLE_CLOUD_PROJECT_ID);
console.log('- GOOGLE_APPLICATION_CREDENTIALS exists:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Initialize Vertex AI - use same config as interviewer API
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID || 'wingman-interview-470419';
const LOCATION = 'us-central1';
console.log(`Using project: ${PROJECT_ID}, location: ${LOCATION}`);

// Use gemini-2.5-pro model for this test
const MODEL = 'gemini-2.5-pro';

// Sample transcript for testing
const SAMPLE_TRANSCRIPT = `
Interviewer: Tell me about a time you had to make a difficult decision.
Candidate: In my previous role at XYZ Corp, I was leading a team of 5 developers on a critical project. We were approaching a major deadline, and I discovered that one of our core features had significant security vulnerabilities. I had to decide whether to delay the launch to fix the issues or proceed with the planned release. After consulting with the security team and stakeholders, I made the difficult decision to delay the launch by two weeks. This allowed us to address the vulnerabilities properly. While this initially disappointed some stakeholders, I communicated transparently about the risks and our mitigation plan. Ultimately, this decision was validated when we launched a secure product that received positive feedback from our security auditors.
Interviewer: How did you handle the team's reaction to this delay?
Candidate: I approached this with complete transparency. I called an emergency team meeting to explain the situation, the security risks, and why we needed to pivot. I acknowledged their hard work and emphasized that the delay wasn't a reflection of their performance. To maintain morale, I reorganized our sprint planning to ensure the additional work was distributed fairly. I also negotiated with management to provide some comp time after the launch to recognize the team's extra efforts. Throughout the delay period, I held daily check-ins to address concerns and celebrate progress. This approach kept the team motivated, and we actually delivered the fixes faster than initially estimated.
`;

// Build a very simplified SQL prompt
function buildSqlPrompt(sessionId, transcript) {
  const nowIso = new Date().toISOString();
  // Use a much shorter transcript to reduce token count
  const shortTranscript = transcript.split('\n').slice(0, 2).join('\n');
  
  return `Generate a PostgreSQL INSERT statement for interview_feedback table with:
- sessionId: '${sessionId}'
- transcript: use dollar quotes $t$...$t$
- contentFeedback: JSON with overallScore10:7, metrics array, summary
- clarityScore: integer 0-100
- speakingPaceWpm: integer ~120
- fillerWordCount: integer ~10
- emotionTimeline: '[]'

Use ON CONFLICT ("sessionId") DO UPDATE SET for all fields.
Output only SQL, no explanations.`;
}

// Function to extract SQL from response
function extractSql(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  
  // Remove code fences
  t = t.replace(/```\s*sql\s*/gi, '').replace(/```/g, '').trim();
  
  // Look for INSERT statement
  if (t.toUpperCase().includes('INSERT INTO')) {
    return t;
  }
  
  return null;
}

async function testGeminiSql() {
  try {
    const sessionId = 'test-session-' + Date.now();
    const prompt = buildSqlPrompt(sessionId, SAMPLE_TRANSCRIPT);
    
    console.log(`\n🔍 Testing SQL prompt with ${MODEL}...\n`);
    
    // Initialize Vertex AI client
    const vertexAi = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
    });
    
    // Configure model with similar settings to interviewer API
    const generationConfig = {
      maxOutputTokens: 1200,
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: 'text/plain',
    };
    
    console.log(`Sending prompt to ${MODEL}...`);
    console.time('Gemini response time');
    
    const generativeModel = vertexAi.preview.getGenerativeModel({
      model: MODEL,
      generationConfig,
    });
    
    const result = await generativeModel.generateContent(prompt);
    console.timeEnd('Gemini response time');
    
    // Show complete response details
    console.log('\n✅ Complete response object:');
    console.log('-------------------');
    
    // Log the full response structure
    const response = result.response;
    console.log('Response structure:', JSON.stringify(response, null, 2));
    
    // Log candidates if they exist
    if (response?.candidates && response.candidates.length > 0) {
      console.log('\nCandidate 0:', JSON.stringify(response.candidates[0], null, 2));
      
      // Log content parts if they exist
      if (response.candidates[0]?.content?.parts) {
        console.log('\nContent parts:', JSON.stringify(response.candidates[0].content.parts, null, 2));
      }
    }
    
    // Try to extract text using different methods
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
    
    console.log('\nExtracted text:', text ? `"${text}"` : '(empty)');
    console.log('-------------------');
    
    // Extract and validate SQL
    const sql = extractSql(text);
    if (sql) {
      console.log('\n🔍 Extracted SQL:');
      console.log('-------------------');
      console.log(sql);
      console.log('-------------------');
    } else {
      console.log('\n❌ Could not extract valid SQL from response');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the test
testGeminiSql().catch(console.error);
