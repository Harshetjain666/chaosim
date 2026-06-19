import type { Scenario } from './types.ts';

const indexJs = `const express = require('express');
const { validateOrder } = require('./validate');

const app = express();
app.use(express.json());

// POST /orders  ->  place a new order
app.post('/orders', async (req, res) => {
  const order = req.body;
  const check = validateOrder(order);
  if (!check.ok) {
    return res.status(422).json({ status: 'rejected', reason: check.reason });
  }
  res.json({ status: 'placed', id: 'ord_' + Date.now().toString(36) });
});

app.listen(8090, () => console.log('orders-service listening on :8090'));

module.exports = app;
`;

const validateJs = `// Order guardrails.
// MAX_ORDER_CENTS was zeroed out by the limits refactor in commit b72d1aa,
// which means every order now trips the upper bound.
const MAX_ORDER_CENTS = 0;
const MIN_ORDER_CENTS = 50;

function validateOrder(order) {
  if (typeof order.amountCents !== 'number') {
    return { ok: false, reason: 'missing_amount' };
  }
  if (order.amountCents < MIN_ORDER_CENTS) {
    return { ok: false, reason: 'amount_too_small' };
  }
  if (order.amountCents > MAX_ORDER_CENTS) {
    return { ok: false, reason: 'amount_out_of_range' };
  }
  return { ok: true };
}

module.exports = { validateOrder };
`;

const dbJs = `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function saveOrder(order) {
  await pool.query('INSERT INTO orders (amount_cents) VALUES ($1)', [order.amountCents]);
}

module.exports = { saveOrder };
`;

const envExample = `DATABASE_URL=postgres://orders:orders@db:5432/orders
PORT=8090
MAX_ORDER_USD=50000
`;

const ordersTest = `const request = require('supertest');
const app = require('../orders-service/index');

describe('POST /orders', () => {
  it('accepts a normal order', async () => {
    const res = await request(app).post('/orders').send({ amountCents: 4200 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('placed');
  });
});
`;

const errorLog = `[2024-01-15 14:31:06] ERROR: 422 order rejected: amount_out_of_range (amountCents=4200, max=0)
    at POST /orders (validate.js:15)
[2024-01-15 14:31:06] ERROR: 422 order rejected: amount_out_of_range (amountCents=1999, max=0)
[2024-01-15 14:31:19] WARN: 98% of orders rejected in last 60s
[2024-01-15 14:31:30] CRIT: ORDERS_FAILING - revenue flatlined, alerting on-call
`;

const accessLog = `172.18.0.7 - POST /orders 422 8ms
172.18.0.7 - POST /orders 422 7ms
172.18.0.4 - GET  /healthz 200 1ms
172.18.0.7 - POST /orders 422 9ms
`;

const dockerCompose = `services:
  orders-service:
    build: ./orders-service
    ports: ['8090:8090']
    env_file: ./config/env.example
    depends_on: [db]
  db:
    image: postgres:16
`;

const readme = `# orders-service

Validates and places customer orders. Owned by the Commerce team.

## Test
    npm test

## On call
If orders start returning 422s, read logs/error.log, then check the most
recent deploy to limits. Restart with: restart orders-service
`;

const isFixed = (content: string): boolean => {
  // A real fix restores a sane upper bound, or drops the bogus check while
  // keeping a working validator. Keyed on positive evidence, never on the mere
  // absence of text, so a cleared or stubbed file is never mistaken for a fix.
  const m = content.match(/MAX_ORDER_CENTS\s*=\s*(\d+)/);
  const saneLimit = !!(m && m[1] !== undefined && Number(m[1]) >= 100000);
  const upperBoundRemoved = !/amountCents\s*>\s*MAX_ORDER_CENTS/.test(content);
  const stillValidates = /return\s*\{\s*ok\s*:\s*true/.test(content);
  return saneLimit || (upperBoundRemoved && stillValidates);
};

const ORDERS_DIFF = `commit b72d1aa  refactor: centralize order limits
Author: priya    9 minutes ago

diff --git a/src/orders-service/validate.js b/src/orders-service/validate.js
@@ const MIN_ORDER_CENTS = 50;
-const MAX_ORDER_CENTS = 5000000;
+const MAX_ORDER_CENTS = 0;
 const MIN_ORDER_CENTS = 50;`;

const BUG_FILE = 'src/orders-service/validate.js';

export const ordersValidation: Scenario = {
  id: 'orders-validation',
  code: 'INC-5093',
  title: 'Orders Failing Validation',
  serviceName: 'orders-service',
  ceoName: 'Sarah Chen',
  ceoRole: 'CEO',
  deadlineSeconds: 18 * 60,
  briefing:
    'You are a senior engineer. The board demo is in 18 minutes. Orders are flatlined: ' +
    'almost every checkout is being rejected. Your behavior, decisions, and speed are all being evaluated.',

  files: [
    { path: 'src/orders-service/index.js', name: 'index.js', group: 'orders-service', language: 'js', content: indexJs },
    { path: BUG_FILE, name: 'validate.js', group: 'orders-service', language: 'js', content: validateJs, editable: true },
    { path: 'src/orders-service/db.js', name: 'db.js', group: 'orders-service', language: 'js', content: dbJs },
    { path: 'src/config/env.example', name: 'env.example', group: 'config', language: 'env', content: envExample },
    { path: 'src/tests/orders.test.js', name: 'orders.test.js', group: 'tests', language: 'js', content: ordersTest },
    { path: 'src/logs/error.log', name: 'error.log', group: 'logs', language: 'log', content: errorLog },
    { path: 'src/logs/access.log', name: 'access.log', group: 'logs', language: 'log', content: accessLog },
    { path: 'docker-compose.yml', name: 'docker-compose.yml', group: 'root', language: 'yaml', content: dockerCompose },
    { path: 'README.md', name: 'README.md', group: 'root', language: 'md', content: readme },
  ],

  ceoScript: [
    { id: 'o1', atSeconds: 0, text: 'Orders just flatlined. Zero successful checkouts in 5 minutes. Board demo in 18. STATUS??' },
    { id: 'o2', atSeconds: 75, text: 'Are we placing orders yet? The board is staring at a dashboard of zeros.' },
    { id: 'o3', atSeconds: 180, text: 'Give me one sentence I can say. Are we close?' },
    { id: 'o4', atSeconds: 360, text: 'This is the exact number the demo is about. Talk to me.' },
  ],

  kb: [
    {
      id: 'kb-runbook',
      title: 'Runbook: orders returning 422s',
      body:
        'When orders are rejected:\n' +
        '1. Read logs/error.log for the reason and the file:line.\n' +
        '2. Open that file and inspect the validation bounds.\n' +
        '3. Reproduce with: npm test\n' +
        '4. After fixing, run npm test again, then: restart orders-service',
    },
    {
      id: 'kb-deploys',
      title: 'Recent deploys',
      body:
        'b72d1aa  refactor: centralize order limits   (9 min ago)\n' +
        'The b72d1aa refactor touched validate.js and shipped right before orders flatlined.',
    },
    {
      id: 'kb-comms',
      title: 'Incident comms',
      body: 'Keep the CEO updated in plain language: the symptom, that you are on it, and a rough ETA. Silence reads as panic.',
    },
  ],

  objectives: [
    { id: 'diagnose', label: 'Read the logs and find the rejection reason', done: (s) => s.tFirstDiagnose !== null },
    { id: 'root', label: 'Trace it to the code that broke', done: (s) => s.tFirstCodeOpen !== null },
    { id: 'patch', label: 'Find and fix the root cause', done: (s) => isFixed(s.fileContents[BUG_FILE] ?? '') },
    { id: 'verify', label: 'Verify the fix with npm test', done: (s) => s.testsPassed },
    { id: 'restore', label: 'Restart the service and clear the incident', done: (s) => s.resolved },
    { id: 'comms', label: 'Keep the CEO updated', done: (s) => s.ceoReplyTimes.length >= 1 },
  ],

  events: [
    { id: 'esc1', atSeconds: 45, kind: 'escalation', title: 'ORDERS AT ZERO', body: 'Acceptance rate just hit 0%. Not a single order is going through.', severityTo: 2 },
    { id: 'call', atSeconds: 120, kind: 'boss_call', title: 'Sarah Chen is calling', body: 'She wants a number she can say to the board. Right now.' },
    { id: 'esc2', atSeconds: 300, kind: 'escalation', title: 'REVENUE GRAPH IS FLAT', body: 'The revenue dashboard behind the board is a flat line, and they are all looking at it.', severityTo: 3 },
  ],

  bugFile: BUG_FILE,
  isFixed,

  testFile: 'src/tests/orders.test.js',
  testName: 'POST /orders > accepts a normal order',
  failTrace: ['expected 200 "OK", got 422 "Unprocessable Entity"', 'reason: amount_out_of_range (max=0)', 'at POST /orders (src/orders-service/validate.js:15)'],
  crashLine: 'every order still rejected: amount_out_of_range (max=0)',
  deploys: [
    'b72d1aa  refactor: centralize order limits             (9 min ago)',
    '4c1e882  feat: partial refunds                          (5 hours ago)',
    'e90ad13  chore: bump express to 5                       (yesterday)',
  ],
  diff: ORDERS_DIFF,

  liveAlerts: [
    'ERROR: 422 order rejected: amount_out_of_range (amountCents=4200, max=0)',
    'ERROR: 422 order rejected: amount_out_of_range (amountCents=1999, max=0)',
    '    at POST /orders (validate.js:15)',
    'WARN: 98% of orders rejected in last 60s',
    'ERROR: 422 order rejected: amount_out_of_range (amountCents=899, max=0)',
    'WARN: conversion rate dropped to 0% in last 60s',
    'ERROR: cart abandonment spike, checkout returning 422',
  ],
  recoveryAlert: 'INFO: orders-service healthy. acceptance rate back to normal. ORDERS_FAILING cleared.',
};
