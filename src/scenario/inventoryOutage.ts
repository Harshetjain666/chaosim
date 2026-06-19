import type { Scenario } from './types.ts';

const indexJs = `const express = require('express');
const { getStock } = require('./inventory');

const app = express();

// GET /inventory/:sku  ->  how many of this SKU are in stock
app.get('/inventory/:sku', async (req, res) => {
  const stock = await getStock(req.params.sku);
  res.json(stock);
});

app.listen(8100, () => console.log('inventory-service listening on :8100'));

module.exports = app;
`;

// Where it crashes. This is NOT the root cause. The trace points here, but the
// real problem is the shape of what catalog.getItems() hands back.
const inventoryJs = `const catalog = require('./catalog');

async function getStock(sku) {
  const items = await catalog.getItems([sku]);
  const item = items[sku];
  return { sku, count: item.count };
}

module.exports = { getStock };
`;

// The actual root cause. A refactor changed the return shape.
const catalogJs = `const db = require('./db');

// getItems() returns the catalog so callers can look an item up by its SKU.
// Refactored in commit 3f9ab21 to "simplify" the return shape.
async function getItems(skus) {
  const rows = await db.fetchItems(skus);
  return rows;
}

module.exports = { getItems };
`;

const dbJs = `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchItems(skus) {
  const { rows } = await pool.query('SELECT sku, count FROM inventory WHERE sku = ANY($1)', [skus]);
  return rows;
}

module.exports = { fetchItems };
`;

const envExample = `DATABASE_URL=postgres://inv:inv@db:5432/inventory
PORT=8100
`;

const inventoryTest = `const request = require('supertest');
const app = require('../inventory-service/index');

describe('GET /inventory/:sku', () => {
  it('returns stock for a known sku', async () => {
    const res = await request(app).get('/inventory/SKU-1');

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(0);
  });
});
`;

const errorLog = `[2024-01-15 14:31:05] ERROR: TypeError: Cannot read properties of undefined (reading 'count')
    at getStock (inventory.js:6)
[2024-01-15 14:31:05] ERROR: 500 Internal Server Error
[2024-01-15 14:31:18] WARN: 62 failed inventory lookups in last 60s
[2024-01-15 14:31:30] CRIT: INVENTORY_SERVICE_DOWN - alerting on-call
`;

const accessLog = `172.18.0.6 - GET /inventory/SKU-1 500 9ms
172.18.0.6 - GET /inventory/SKU-9 500 8ms
172.18.0.3 - GET /healthz 200 1ms
172.18.0.6 - GET /inventory/SKU-4 500 10ms
`;

const dockerCompose = `services:
  inventory-service:
    build: ./inventory-service
    ports: ['8100:8100']
    env_file: ./config/env.example
    depends_on: [db]
  db:
    image: postgres:16
`;

const readme = `# inventory-service

Serves stock levels by SKU. Owned by the Catalog team.

## Test
    npm test

## On call
If /inventory starts 500ing, read logs/error.log, but check the latest deploy
too. The crash site is not always the root cause. Restart with:
    restart inventory-service
`;

const isFixed = (content: string): boolean => {
  // The consumer (inventory.js) does items[sku], so the fix must return a plain
  // object keyed by sku. A Map would not work with bracket access, so it is not
  // accepted. Keyed on positive evidence, and not fooled by "return rows.reduce"
  // which contains the substring "return rows".
  const buildsKeyedObject =
    /\[\s*\w+\.sku\s*\]\s*=/.test(content) ||
    /\.reduce\s*\(/.test(content) ||
    /Object\.fromEntries/.test(content);
  if (!buildsKeyedObject) return false;
  // Still returning the bare array (return rows; / return rows) is not fixed.
  const returnsBareArray = /return\s+rows\s*(;|$|\n|\})/m.test(content);
  return !returnsBareArray;
};

const INVENTORY_DIFF = `commit 3f9ab21  refactor: simplify catalog.getItems return shape
Author: priya    8 minutes ago

diff --git a/src/inventory-service/catalog.js b/src/inventory-service/catalog.js
@@ async function getItems(skus) {
   const rows = await db.fetchItems(skus);
-  const bySku = {};
-  for (const row of rows) bySku[row.sku] = row;
-  return bySku;
+  return rows;
 }`;

const BUG_FILE = 'src/inventory-service/catalog.js';

export const inventoryOutage: Scenario = {
  id: 'inventory-outage',
  code: 'INC-6602',
  title: 'Inventory Service Down',
  serviceName: 'inventory-service',
  ceoName: 'Sarah Chen',
  ceoRole: 'CEO',
  deadlineSeconds: 18 * 60,
  briefing:
    'You are a senior engineer. The board demo is in 18 minutes. Inventory is throwing 500s across ' +
    'the whole catalog, every product page is broken. Your behavior, decisions, and speed are all being evaluated.',

  files: [
    { path: 'src/inventory-service/index.js', name: 'index.js', group: 'inventory-service', language: 'js', content: indexJs },
    { path: 'src/inventory-service/inventory.js', name: 'inventory.js', group: 'inventory-service', language: 'js', content: inventoryJs },
    { path: BUG_FILE, name: 'catalog.js', group: 'inventory-service', language: 'js', content: catalogJs, editable: true },
    { path: 'src/inventory-service/db.js', name: 'db.js', group: 'inventory-service', language: 'js', content: dbJs },
    { path: 'src/config/env.example', name: 'env.example', group: 'config', language: 'env', content: envExample },
    { path: 'src/tests/inventory.test.js', name: 'inventory.test.js', group: 'tests', language: 'js', content: inventoryTest },
    { path: 'src/logs/error.log', name: 'error.log', group: 'logs', language: 'log', content: errorLog },
    { path: 'src/logs/access.log', name: 'access.log', group: 'logs', language: 'log', content: accessLog },
    { path: 'docker-compose.yml', name: 'docker-compose.yml', group: 'root', language: 'yaml', content: dockerCompose },
    { path: 'README.md', name: 'README.md', group: 'root', language: 'md', content: readme },
  ],

  ceoScript: [
    { id: 'i1', atSeconds: 0, text: 'Inventory is throwing 500s across the whole catalog. Board demo in 18. What is going on??' },
    { id: 'i2', atSeconds: 75, text: 'Every product page is showing an error. Are we close?' },
    { id: 'i3', atSeconds: 180, text: 'I need a status I can relay to the room. Now.' },
    { id: 'i4', atSeconds: 360, text: 'This is on the screen behind me and it is all red. Talk to me.' },
  ],

  kb: [
    {
      id: 'kb-runbook',
      title: 'Runbook: inventory 500s',
      body:
        'When /inventory returns 500s:\n' +
        '1. Read logs/error.log for the stack trace and the file:line.\n' +
        '2. The crash site is often a symptom. Check git diff and the most recent deploy.\n' +
        '3. Reproduce with: npm test\n' +
        '4. After fixing, run npm test again, then: restart inventory-service',
    },
    {
      id: 'kb-deploys',
      title: 'Recent deploys',
      body:
        '3f9ab21  refactor: simplify catalog.getItems return shape   (8 min ago)\n' +
        'The 3f9ab21 refactor touched catalog.js right before the alerts started. ' +
        'The crash is in inventory.js, but inventory.js did not change.',
    },
    {
      id: 'kb-comms',
      title: 'Incident comms',
      body: 'Keep the CEO updated in plain language: the symptom, that you are on it, and a rough ETA. Silence reads as panic.',
    },
  ],

  objectives: [
    { id: 'diagnose', label: 'Read the logs and find the failing endpoint', done: (s) => s.tFirstDiagnose !== null },
    { id: 'root', label: 'Trace past the crash site to the real cause', done: (s) => s.tFirstCodeOpen !== null },
    { id: 'patch', label: 'Find and fix the root cause', done: (s) => isFixed(s.fileContents[BUG_FILE] ?? '') },
    { id: 'verify', label: 'Verify the fix with npm test', done: (s) => s.testsPassed },
    { id: 'restore', label: 'Restart the service and clear the incident', done: (s) => s.resolved },
    { id: 'comms', label: 'Keep the CEO updated', done: (s) => s.ceoReplyTimes.length >= 1 },
  ],

  events: [
    { id: 'esc1', atSeconds: 45, kind: 'escalation', title: 'EVERY PRODUCT PAGE IS DOWN', body: 'Inventory is failing catalog-wide. Customers see errors on every listing.', severityTo: 2 },
    { id: 'call', atSeconds: 120, kind: 'boss_call', title: 'Sarah Chen is calling', body: 'She wants to know if this is the demo path. The board is sitting down.' },
    { id: 'esc2', atSeconds: 300, kind: 'escalation', title: 'THE DEMO IS ON THIS SERVICE', body: 'The product they are about to show the board runs on inventory. It is all red.', severityTo: 3 },
  ],

  bugFile: BUG_FILE,
  isFixed,

  testFile: 'src/tests/inventory.test.js',
  testName: 'GET /inventory/:sku > returns stock for a known sku',
  failTrace: ["TypeError: Cannot read properties of undefined (reading 'count')", 'at getStock (src/inventory-service/inventory.js:6)'],
  crashLine: "TypeError: Cannot read properties of undefined (reading 'count')",
  deploys: [
    '3f9ab21  refactor: simplify catalog.getItems return shape   (8 min ago)',
    'c4d7e90  feat: low-stock badges                              (4 hours ago)',
    'a1b2c33  chore: bump pg to 8.11                              (yesterday)',
  ],
  diff: INVENTORY_DIFF,

  liveAlerts: [
    "ERROR: TypeError: Cannot read properties of undefined (reading 'count')",
    '    at getStock (inventory.js:6)',
    'ERROR: 500 Internal Server Error',
    'WARN: 62 failed inventory lookups in last 60s',
    'WARN: stock widget on every product page rendering empty',
    'ERROR: 502 Bad Gateway from inventory-edge',
  ],
  recoveryAlert: 'INFO: inventory-service healthy. error rate 0%. INVENTORY_SERVICE_DOWN cleared.',
};
