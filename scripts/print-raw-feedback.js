// Print raw stored Gemini contentFeedback for a given sessionId
// Usage:
//   node scripts/print-raw-feedback.js --session <SESSION_ID>
//
// Example:
//   node scripts/print-raw-feedback.js --session cmf7mewja006614klnnxzd9cv

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

function parseArgs(argv) {
  const out = { session: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--session' || a === '-s') && argv[i + 1]) { out.session = argv[++i]; continue; }
  }
  return out;
}

async function main() {
  const { session } = parseArgs(process.argv);
  if (!session) {
    console.error('Missing --session <SESSION_ID>');
    console.error('Example: node scripts/print-raw-feedback.js --session cmf7mewja006614klnnxzd9cv');
    process.exit(1);
  }

  try {
    console.log(`[RawFeedback] Looking up interview_feedback for sessionId=${session}`);
    const fb = await prisma.interviewFeedback.findUnique({
      where: { sessionId: session },
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

    if (!fb) {
      console.log('[RawFeedback] No interview_feedback row found for that sessionId');
      process.exit(0);
    }

    const raw = typeof fb.contentFeedback === 'string' ? fb.contentFeedback : String(fb.contentFeedback ?? '');

    console.log('\n=== Raw contentFeedback (exact DB value) ===');
    console.log(raw);

    console.log('\n=== Metadata (for reference) ===');
    console.log(JSON.stringify({
      sessionId: fb.sessionId,
      updatedAt: fb.updatedAt,
      clarityScore: fb.clarityScore,
      speakingPaceWpm: fb.speakingPaceWpm,
      fillerWordCount: fb.fillerWordCount,
    }, null, 2));

  } catch (err) {
    console.error('[RawFeedback] Error:', err && err.message ? err.message : String(err));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
