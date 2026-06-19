import type { Scenario } from './types.ts';

const indexJs = `const express = require('express');
const payment = require('./payment');

const app = express();
app.use(express.json());

// POST /charge  ->  charge a customer's card for an order
app.post('/charge', async (req, res) => {
  const { customerId, amountCents, currency } = req.body;
  const result = await payment.charge({ customerId, amountCents, currency });
  if (result.ok) {
    res.json({ status: 'charged', id: result.transactionId });
  } else {
    res.status(402).json({ status: 'declined', reason: result.reason });
  }
});

app.listen(8080, () => console.log('payment-service listening on :8080'));

module.exports = app;
`;

const paymentJs = `const db = require('./db');

// charge() calls the provider and records the transaction.
// Refactored in commit a91f3c2 to split out callProvider().
async function charge({ customerId, amountCents, currency }) {
  const account = await db.getAccount(customerId);
  if (!account) {
    return { ok: false, reason: 'no_account' };
  }

  const result = await callProvider(account, amountCents, currency);
  await db.saveTransaction(customerId, result);
  // the success path ends here
}

async function callProvider(account, amountCents, currency) {
  if (amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }
  return { ok: true, transactionId: 'txn_' + Date.now().toString(36) };
}

module.exports = { charge };
`;

const dbJs = `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getAccount(customerId) {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE customer_id = $1', [customerId]);
  return rows[0] || null;
}

async function saveTransaction(customerId, result) {
  await pool.query(
    'INSERT INTO transactions (customer_id, ok, txn_id) VALUES ($1, $2, $3)',
    [customerId, result.ok, result.transactionId || null],
  );
}

module.exports = { getAccount, saveTransaction };
`;

const envExample = `DATABASE_URL=postgres://payments:payments@db:5432/payments
REDIS_URL=redis://redis:6379
PROVIDER_API_KEY=sk_live_xxxxxxxxxxxxxxxx
PORT=8080
`;

const paymentTest = `const request = require('supertest');
const app = require('../payment-service/index');

describe('POST /charge', () => {
  it('charges a valid account and returns ok', async () => {
    const res = await request(app)
      .post('/charge')
      .send({ customerId: 'cus_123', amountCents: 4200, currency: 'usd' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('charged');
  });
});
`;

const errorLog = `[2024-01-15 14:31:02] ERROR: TypeError: Cannot read property 'ok' of undefined
    at POST /charge (index.js:11)
[2024-01-15 14:31:02] ERROR: 500 Internal Server Error
[2024-01-15 14:31:15] ERROR: TypeError: Cannot read property 'ok' of undefined
    at POST /charge (index.js:11)
[2024-01-15 14:31:15] ERROR: 500 Internal Server Error
[2024-01-15 14:31:28] WARN: 47 failed payment requests in last 60s
[2024-01-15 14:31:30] CRIT: PAYMENT_SERVICE_DOWN - alerting on-call
`;

const accessLog = `172.18.0.5 - POST /charge 500 14ms
172.18.0.5 - POST /charge 500 12ms
172.18.0.9 - POST /charge 500 13ms
172.18.0.2 - GET  /healthz 200 1ms
172.18.0.9 - POST /charge 500 15ms
`;

const dockerCompose = `services:
  payment-service:
    build: ./payment-service
    ports: ['8080:8080']
    env_file: ./config/env.example
    depends_on: [db, redis]
  db:
    image: postgres:16
  redis:
    image: redis:7
`;

const readme = `# payment-service

Charges customer cards for orders. Owned by the Payments team.

## Run
    npm install
    npm start

## Test
    npm test

## On call
If POST /charge starts 500ing, check logs/error.log first, then the most
recent deploy. Restart with: restart payment-service
`;

const isFixed = (content: string): boolean => {
  // Keep the error handling intact, and make charge() actually return on the
  // success path. Accept the common ways an engineer would write that return.
  const keepsNoAccount = /return\s*\{\s*ok:\s*false,\s*reason:\s*'no_account'/.test(content);
  if (!keepsNoAccount) return false;
  // charge() must return on the success path. Accept the common phrasings,
  // but not callProvider's own "return { ok: true }" which is always present.
  return /return\s+result\b/.test(content) || /return\s+await\s+callProvider\s*\(/.test(content);
};

const PAYMENT_DIFF = `commit a91f3c2  refactor: split provider call out of payment.charge()
Author: priya    12 minutes ago

diff --git a/src/payment-service/payment.js b/src/payment-service/payment.js
@@ async function charge({ customerId, amountCents, currency }) {
   const result = await callProvider(account, amountCents, currency);
   await db.saveTransaction(customerId, result);
-  return result;
+  // the success path ends here
 }`;

const BUG_FILE = 'src/payment-service/payment.js';

export const paymentOutage: Scenario = {
  id: 'payment-outage',
  code: 'INC-4821',
  title: 'Payment Service Down',
  serviceName: 'payment-service',
  ceoName: 'Sarah Chen',
  ceoRole: 'CEO',
  deadlineSeconds: 18 * 60,
  briefing:
    'You are a senior engineer. The board demo is in 18 minutes. The payment service is down. ' +
    'This is real. Your behavior, decisions, and speed are all being evaluated.',

  files: [
    { path: 'src/payment-service/index.js', name: 'index.js', group: 'payment-service', language: 'js', content: indexJs },
    { path: BUG_FILE, name: 'payment.js', group: 'payment-service', language: 'js', content: paymentJs, editable: true },
    { path: 'src/payment-service/db.js', name: 'db.js', group: 'payment-service', language: 'js', content: dbJs },
    { path: 'src/config/env.example', name: 'env.example', group: 'config', language: 'env', content: envExample },
    { path: 'src/tests/payment.test.js', name: 'payment.test.js', group: 'tests', language: 'js', content: paymentTest },
    { path: 'src/logs/error.log', name: 'error.log', group: 'logs', language: 'log', content: errorLog },
    { path: 'src/logs/access.log', name: 'access.log', group: 'logs', language: 'log', content: accessLog },
    { path: 'docker-compose.yml', name: 'docker-compose.yml', group: 'root', language: 'yaml', content: dockerCompose },
    { path: 'README.md', name: 'README.md', group: 'root', language: 'md', content: readme },
  ],

  ceoScript: [
    { id: 'c1', atSeconds: 0, text: 'WTF is happening - our entire checkout is down. Board demo in 18 min. WHAT IS THE STATUS??' },
    { id: 'c2', atSeconds: 75, text: 'Are we any closer? The board is walking into the room.' },
    { id: 'c3', atSeconds: 180, text: 'I need one line I can say out loud right now. What do I tell them?' },
    { id: 'c4', atSeconds: 360, text: 'Every minute this is down we are losing real money. Talk to me.' },
  ],

  kb: [
    {
      id: 'kb-runbook',
      title: 'Runbook: payment-service 500s',
      body:
        'When POST /charge returns 500s:\n' +
        '1. Read logs/error.log for the stack trace and the file:line.\n' +
        '2. Open that file and inspect the failing call path.\n' +
        '3. Reproduce with: npm test\n' +
        '4. After fixing, run npm test again, then: restart payment-service',
    },
    {
      id: 'kb-deploys',
      title: 'Recent deploys',
      body:
        'a91f3c2  refactor: split provider call out of payment.charge()  (12 min ago)\n' +
        'The a91f3c2 refactor touched payment.js and shipped right before the alerts started.',
    },
    {
      id: 'kb-comms',
      title: 'Incident comms',
      body: 'Keep the CEO updated in plain language: the symptom, that you are on it, and a rough ETA. Silence reads as panic.',
    },
  ],

  objectives: [
    { id: 'diagnose', label: 'Read the logs and find the failing endpoint', done: (s) => s.tFirstDiagnose !== null },
    { id: 'root', label: 'Trace it to the code that broke', done: (s) => s.tFirstCodeOpen !== null },
    { id: 'patch', label: 'Find and fix the root cause', done: (s) => isFixed(s.fileContents[BUG_FILE] ?? '') },
    { id: 'verify', label: 'Verify the fix with npm test', done: (s) => s.testsPassed },
    { id: 'restore', label: 'Restart the service and clear the incident', done: (s) => s.resolved },
    { id: 'comms', label: 'Keep the CEO updated', done: (s) => s.ceoReplyTimes.length >= 1 },
  ],

  events: [
    { id: 'esc1', atSeconds: 45, kind: 'escalation', title: 'PRODUCTION FULLY DOWN', body: 'Every checkout endpoint is now returning 500. Customers cannot pay at all.', severityTo: 2 },
    { id: 'call', atSeconds: 120, kind: 'boss_call', title: 'Sarah Chen is calling', body: 'She wants a verbal update. The board is in the room right behind her.' },
    { id: 'esc2', atSeconds: 300, kind: 'escalation', title: 'THE BOARD IS WATCHING THE DASHBOARD', body: 'Your error graph is on the screen behind the CEO. Every red minute is in front of the board.', severityTo: 3 },
  ],

  bugFile: BUG_FILE,
  isFixed,

  testFile: 'src/tests/payment.test.js',
  testName: 'POST /charge > charges a valid account and returns ok',
  failTrace: ["TypeError: Cannot read property 'ok' of undefined", 'at POST /charge (src/payment-service/index.js:11)'],
  crashLine: "TypeError: Cannot read property 'ok' of undefined",
  deploys: [
    'a91f3c2  refactor: split provider call out of payment.charge()   (12 min ago)',
    '7d4e0b1  chore: bump pg to 8.11                                   (3 hours ago)',
    'f02ca90  feat: idempotency keys for charges                       (yesterday)',
  ],
  diff: PAYMENT_DIFF,

  liveAlerts: [
    "ERROR: TypeError: Cannot read property 'ok' of undefined",
    'ERROR: 500 Internal Server Error',
    "    at POST /charge (index.js:11)",
    'WARN: 47 failed payment requests in last 60s',
    'ERROR: payment.charge() resolved to undefined',
    'WARN: checkout p99 latency 8.1s, clients timing out',
    'ERROR: 502 Bad Gateway from checkout-edge',
  ],
  recoveryAlert: 'INFO: payment-service healthy. error rate 0%. PAYMENT_SERVICE_DOWN cleared.',
};
