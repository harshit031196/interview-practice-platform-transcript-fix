// Test script to retrieve Gemini feedback (normalized JSON + renderedText narrative)
// Usage:
//   node test-get-gemini-feedback.js <sessionId> [testEmail]
// Example:
//   node test-get-gemini-feedback.js cmf74xv9e004t14kleh25l0p0 pm.candidate@example.com

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const DEFAULT_EMAILS = [
  process.env.TEST_EMAIL,
  'pm.candidate@example.com', // seen in logs
  'test@example.com',         // common fallback in repo tests
].filter(Boolean);

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

async function findFirstExistingUser(emails) {
  for (const email of emails) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        log(`Using user: ${user.email} (${user.id})`);
        return user;
      }
    } catch (err) {
      log('Error querying user', err?.message || err);
    }
  }
  return null;
}

async function createDbSession(userId) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const session = await prisma.session.create({
    data: { sessionToken, userId, expires },
  });
  log('Created DB session', { id: session.id, userId: session.userId, expires: session.expires.toISOString() });
  return sessionToken;
}

async function getFeedback(sessionToken, sessionId) {
  const url = `${BASE_URL}/api/interviews/${encodeURIComponent(sessionId)}/feedback`;
  log('GET', url);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: `next-auth.session-token=${sessionToken}`,
    },
  });
  log('Response status', res.status);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    log('Body:', text);
    throw new Error(`GET feedback failed ${res.status}`);
  }
  return json;
}

function printFeedbackPayload(payload) {
  const { normalized, renderedText, feedback, numbersMode, labels, values } = payload || {};

  log('--- Feedback Payload Summary ---');
  if (feedback?.sessionId) log('sessionId:', feedback.sessionId);
  log('numbersMode:', !!numbersMode, 'labels:', Array.isArray(labels) ? labels.length : 0, 'values:', Array.isArray(values) ? values.length : 0);
  if (feedback?.updatedAt) log('updatedAt:', feedback.updatedAt);

  if (normalized) {
    log('normalized.overallScore10:', normalized.overallScore10);
    log('normalized.interviewType:', normalized.interviewType);
    const mCount = Array.isArray(normalized.metrics) ? normalized.metrics.length : 0;
    log('normalized.metrics.length:', mCount);
    if (mCount) {
      const top = normalized.metrics.slice(0, 5).map(m => ({ name: m.name, score10: m.score10, explanation: (m.explanation || '').slice(0, 120) }));
      log('normalized.metrics[0..4]:', JSON.stringify(top, null, 2));
    }
    if (typeof normalized.summary === 'string') {
      log('normalized.summary:', normalized.summary.slice(0, 240));
    }
    if (Array.isArray(normalized.nextSteps)) {
      log('normalized.nextSteps.count:', normalized.nextSteps.length);
      if (normalized.nextSteps.length) log('normalized.nextSteps[0..3]:', JSON.stringify(normalized.nextSteps.slice(0, 3), null, 2));
    }
  } else {
    log('normalized: null');
  }

  if (typeof renderedText === 'string' && renderedText.trim()) {
    log('renderedText (first 400 chars):');
    console.log('\n' + renderedText.slice(0, 400) + (renderedText.length > 400 ? '…' : '') + '\n');
  } else {
    log('renderedText: <empty>');
  }
}

async function main() {
  const sessionId = process.argv[2] || 'cmf74xv9e004t14kleh25l0p0';
  const emailArg = process.argv[3];
  const emails = emailArg ? [emailArg, ...DEFAULT_EMAILS] : DEFAULT_EMAILS;

  if (!sessionId) {
    console.error('Usage: node test-get-gemini-feedback.js <sessionId> [testEmail]');
    process.exit(1);
  }

  log('Starting test for sessionId:', sessionId);

  try {
    // Find a user we can authenticate as
    const user = await findFirstExistingUser(emails);
    if (!user) {
      throw new Error(`No test user found. Tried: ${emails.join(', ')}`);
    }

    // Create DB session
    const sessionToken = await createDbSession(user.id);

    // Call GET feedback
    const payload = await getFeedback(sessionToken, sessionId);
    printFeedbackPayload(payload);

    log('✅ Test completed');
  } catch (err) {
    log('❌ Test failed:', err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
