import type { SourceFile } from '../scenario/types.ts';
import type { ArchetypeKind, CompanyContext, ServiceSpec } from './context.ts';
import { type ArchetypeParts, type GeneratedScenario, assembleScenario } from './scaffold.ts';

/**
 * Each archetype is one bug shape, mirroring the three hand-authored incidents:
 *   missing-return  a refactor dropped the return on the handler's success path
 *   zeroed-limit    a guardrail constant was zeroed, so every request is rejected
 *   broken-shape    a function returns the wrong shape and crashes a consumer
 * A builder fills in only the bug-specific parts; the scaffold assembles the
 * full Scenario (CEO, KB, objectives, events, metadata) around them.
 */

// ---------------------------------------------------------------------------
// missing-return
// ---------------------------------------------------------------------------

function missingReturn(ctx: CompanyContext, svc: ServiceSpec): GeneratedScenario {
  const hm = svc.handlerModule;
  const fn = svc.handlerFn;
  const method = svc.method.toUpperCase();
  const methodLower = svc.method.toLowerCase();
  const bugFile = `src/${svc.name}/${hm}.js`;
  const indexPath = `src/${svc.name}/index.js`;

  const indexJs = `const express = require('express');
const ${hm} = require('./${hm}');

const app = express();
app.use(express.json());

// ${method} ${svc.path}  ->  process a ${svc.noun}
app.${methodLower}('${svc.path}', async (req, res) => {
  const result = await ${hm}.${fn}(req.body);
  if (result.ok) {
    res.json({ status: 'ok', id: result.id });
  } else {
    res.status(422).json({ status: 'failed', reason: result.reason });
  }
});

app.listen(${svc.port}, () => console.log('${svc.name} listening on :${svc.port}'));

module.exports = app;
`;

  const brokenContent = `const db = require('./db');

// ${fn}() processes the ${svc.noun} and records it.
// Refactored in commit ${svc.recentCommit} to split out callProvider().
async function ${fn}(input) {
  const account = await db.lookup(input.accountId);
  if (!account) {
    return { ok: false, reason: 'not_found' };
  }

  const result = await callProvider(account, input);
  await db.record(result);
  // the success path ends here
}

async function callProvider(account, input) {
  if (!input || input.amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }
  return { ok: true, id: '${svc.noun}_' + Date.now().toString(36) };
}

module.exports = { ${fn} };
`;

  const referenceFixContent = brokenContent.replace('  // the success path ends here', '  return result;');

  const dbJs = `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function lookup(accountId) {
  const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [accountId]);
  return rows[0] || null;
}

async function record(result) {
  await pool.query('INSERT INTO ${svc.noun}_log (ok, ref) VALUES ($1, $2)', [result.ok, result.id || null]);
}

module.exports = { lookup, record };
`;

  const serviceFiles: SourceFile[] = [
    { path: indexPath, name: 'index.js', group: svc.name, language: 'js', content: indexJs },
    { path: bugFile, name: `${hm}.js`, group: svc.name, language: 'js', content: brokenContent, editable: true },
    { path: `src/${svc.name}/db.js`, name: 'db.js', group: svc.name, language: 'js', content: dbJs },
  ];

  const testContent = `const request = require('supertest');
const app = require('../${svc.name}/index');

describe('${method} ${svc.path}', () => {
  it('processes a valid ${svc.noun} and returns ok', async () => {
    const res = await request(app).${methodLower}('${svc.path}').send({ accountId: 'acc_1', amountCents: 4200 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
`;

  const errorLog = `[2024-01-15 14:31:02] ERROR: TypeError: Cannot read property 'ok' of undefined
    at ${method} ${svc.path} (index.js:10)
[2024-01-15 14:31:02] ERROR: 500 Internal Server Error
[2024-01-15 14:31:15] ERROR: TypeError: Cannot read property 'ok' of undefined
    at ${method} ${svc.path} (index.js:10)
[2024-01-15 14:31:28] WARN: 47 failed ${svc.noun} requests in last 60s
[2024-01-15 14:31:30] CRIT: service down - alerting on-call
`;

  const diff = `commit ${svc.recentCommit}  refactor: split provider call out of ${hm}.${fn}()
Author: a teammate    11 minutes ago

diff --git a/${bugFile} b/${bugFile}
@@ async function ${fn}(input) {
   const result = await callProvider(account, input);
   await db.record(result);
-  return result;
+  // the success path ends here
 }`;

  const parts: ArchetypeParts = {
    serviceFiles,
    bugFile,
    brokenContent,
    referenceFixContent,
    isFixed: (content) => {
      const keepsNotFound = /return\s*\{\s*ok:\s*false,\s*reason:\s*'not_found'/.test(content);
      if (!keepsNotFound) return false;
      return /return\s+result\b/.test(content) || /return\s+await\s+callProvider\s*\(/.test(content);
    },
    testFile: `src/tests/${hm}.test.js`,
    testName: `${method} ${svc.path} > processes a valid ${svc.noun} and returns ok`,
    testContent,
    errorLog,
    failTrace: ["TypeError: Cannot read property 'ok' of undefined", `at ${method} ${svc.path} (${indexPath}:10)`],
    crashLine: "TypeError: Cannot read property 'ok' of undefined",
    diff,
    liveAlerts: [
      "ERROR: TypeError: Cannot read property 'ok' of undefined",
      'ERROR: 500 Internal Server Error',
      `    at ${method} ${svc.path} (index.js:10)`,
      `WARN: 47 failed ${svc.noun} requests in last 60s`,
      `ERROR: ${hm}.${fn}() resolved to undefined`,
      'ERROR: 502 Bad Gateway from checkout-edge',
    ],
    symptom: `down, ${method} ${svc.path} is throwing 500s`,
    diagnoseObjective: 'Read the logs and find the failing endpoint',
    rootObjective: 'Trace it to the code that broke',
  };

  return assembleScenario(ctx, svc, parts);
}

// ---------------------------------------------------------------------------
// zeroed-limit
// ---------------------------------------------------------------------------

function zeroedLimit(ctx: CompanyContext, svc: ServiceSpec): GeneratedScenario {
  const hm = svc.handlerModule;
  const method = svc.method.toUpperCase();
  const methodLower = svc.method.toLowerCase();
  const bugFile = `src/${svc.name}/${hm}.js`;
  const indexPath = `src/${svc.name}/index.js`;
  const limit = `MAX_${svc.noun.toUpperCase()}_CENTS`;
  const floor = `MIN_${svc.noun.toUpperCase()}_CENTS`;

  const indexJs = `const express = require('express');
const { validate } = require('./${hm}');

const app = express();
app.use(express.json());

// ${method} ${svc.path}  ->  place a ${svc.noun}
app.${methodLower}('${svc.path}', async (req, res) => {
  const check = validate(req.body);
  if (!check.ok) {
    return res.status(422).json({ status: 'rejected', reason: check.reason });
  }
  res.json({ status: 'placed', id: '${svc.noun}_' + Date.now().toString(36) });
});

app.listen(${svc.port}, () => console.log('${svc.name} listening on :${svc.port}'));

module.exports = app;
`;

  const brokenContent = `// ${ctx.company} ${svc.noun} guardrails.
// ${limit} was zeroed out by the limits refactor in ${svc.recentCommit},
// so every ${svc.noun} now trips the upper bound.
const ${limit} = 0;
const ${floor} = 50;

function validate(input) {
  if (typeof input.amountCents !== 'number') {
    return { ok: false, reason: 'missing_amount' };
  }
  if (input.amountCents < ${floor}) {
    return { ok: false, reason: 'amount_too_small' };
  }
  if (input.amountCents > ${limit}) {
    return { ok: false, reason: 'amount_out_of_range' };
  }
  return { ok: true };
}

module.exports = { validate };
`;

  const referenceFixContent = brokenContent.replace(`const ${limit} = 0;`, `const ${limit} = 5000000;`);

  const serviceFiles: SourceFile[] = [
    { path: indexPath, name: 'index.js', group: svc.name, language: 'js', content: indexJs },
    { path: bugFile, name: `${hm}.js`, group: svc.name, language: 'js', content: brokenContent, editable: true },
  ];

  const testContent = `const request = require('supertest');
const app = require('../${svc.name}/index');

describe('${method} ${svc.path}', () => {
  it('accepts a normal ${svc.noun} and places it', async () => {
    const res = await request(app).${methodLower}('${svc.path}').send({ amountCents: 4200 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('placed');
  });
});
`;

  const errorLog = `[2024-01-15 14:31:02] WARN: 422 ${svc.noun} rejected: amount_out_of_range (amountCents=4200, max=0)
    at ${method} ${svc.path} (${hm}.js:15)
[2024-01-15 14:31:09] WARN: 422 ${svc.noun} rejected: amount_out_of_range (amountCents=1999, max=0)
    at ${method} ${svc.path} (${hm}.js:15)
[2024-01-15 14:31:20] WARN: 61 ${svc.noun}s rejected in last 60s
[2024-01-15 14:31:30] CRIT: service degraded - every ${svc.noun} is failing validation
`;

  const diff = `commit ${svc.recentCommit}  refactor: centralize ${svc.noun} limits in ${hm}.js
Author: a teammate    11 minutes ago

diff --git a/${bugFile} b/${bugFile}
@@ ${svc.noun} guardrails
-const ${limit} = 5000000;
+const ${limit} = 0;
 const ${floor} = 50;`;

  const parts: ArchetypeParts = {
    serviceFiles,
    bugFile,
    brokenContent,
    referenceFixContent,
    isFixed: (content) => {
      const m = content.match(new RegExp(`${limit}\\s*=\\s*(\\d+)`));
      const saneLimit = !!(m && Number(m[1]) >= 100000);
      const upperBoundRemoved = !new RegExp(`amountCents\\s*>\\s*${limit}`).test(content);
      const stillReturnsOk = /return\s*\{\s*ok:\s*true/.test(content);
      return saneLimit || (upperBoundRemoved && stillReturnsOk);
    },
    testFile: `src/tests/${hm}.test.js`,
    testName: `${method} ${svc.path} > accepts a normal ${svc.noun} and places it`,
    testContent,
    errorLog,
    failTrace: [
      'expected status 200 but got 422',
      `reason: 'amount_out_of_range' (max=0)`,
      `at ${method} ${svc.path} (${bugFile}:15)`,
    ],
    crashLine: `Every ${svc.noun} rejected: amount_out_of_range (the upper bound is zero)`,
    diff,
    liveAlerts: [
      `WARN: 422 ${svc.noun} rejected: amount_out_of_range`,
      `WARN: validate() is rejecting every ${svc.noun} (max=0)`,
      `    at ${method} ${svc.path} (${hm}.js:15)`,
      `WARN: 61 ${svc.noun}s rejected in last 60s`,
      'ERROR: cart conversion dropped to 0%',
      'ERROR: 502 Bad Gateway from checkout-edge',
    ],
    symptom: `rejecting almost every ${svc.noun} at ${method} ${svc.path}`,
    diagnoseObjective: `Read the logs and find why ${svc.noun}s are being rejected`,
    rootObjective: 'Trace the rejection to the limit that changed',
  };

  return assembleScenario(ctx, svc, parts);
}

// ---------------------------------------------------------------------------
// broken-shape
// ---------------------------------------------------------------------------

function brokenShape(ctx: CompanyContext, svc: ServiceSpec): GeneratedScenario {
  const fn = svc.handlerFn;
  const method = svc.method.toUpperCase();
  const methodLower = svc.method.toLowerCase();
  const key = svc.lookupKey ?? 'id';
  const field = svc.valueField ?? svc.noun;
  const bugFile = `src/${svc.name}/catalog.js`;
  const consumerPath = `src/${svc.name}/${svc.handlerModule}.js`;
  const indexPath = `src/${svc.name}/index.js`;

  const indexJs = `const express = require('express');
const ${svc.handlerModule} = require('./${svc.handlerModule}');

const app = express();
app.use(express.json());

// ${method} ${svc.path}?${key}s=...  ->  available ${field} per ${svc.noun}
app.${methodLower}('${svc.path}', async (req, res) => {
  const ${key}s = (req.query.${key}s || '').split(',').filter(Boolean);
  const result = await ${svc.handlerModule}.${fn}(${key}s);
  res.json({ status: 'ok', items: result });
});

app.listen(${svc.port}, () => console.log('${svc.name} listening on :${svc.port}'));

module.exports = app;
`;

  // The crash site. Reads items[key].field, which throws once getItems()
  // returns a raw array instead of a keyed lookup. This is NOT the bug.
  const consumerJs = `const catalog = require('./catalog');

// ${fn}(${key}s) -> ${field} available for each ${svc.noun}
async function ${fn}(${key}s) {
  const items = await catalog.getItems(${key}s);
  return ${key}s.map((${key}) => ({
    ${key},
    ${field}: items[${key}].${field},
  }));
}

module.exports = { ${fn} };
`;

  const brokenContent = `const db = require('./db');

// getItems(${key}s) should return a lookup keyed by ${key} so callers can do
// items[${key}]. The ${svc.recentCommit} refactor changed it to return the raw
// rows array, so items[${key}] is now undefined for every caller.
async function getItems(${key}s) {
  const rows = await db.fetchItems(${key}s);
  return rows;
}

module.exports = { getItems };
`;

  const referenceFixContent = brokenContent.replace(
    '  return rows;',
    `  return rows.reduce((acc, row) => {\n    acc[row.${key}] = row;\n    return acc;\n  }, {});`,
  );

  const dbJs = `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchItems(${key}s) {
  const { rows } = await pool.query('SELECT ${key}, ${field} FROM inventory WHERE ${key} = ANY($1)', [${key}s]);
  return rows;
}

module.exports = { fetchItems };
`;

  const serviceFiles: SourceFile[] = [
    { path: indexPath, name: 'index.js', group: svc.name, language: 'js', content: indexJs },
    { path: consumerPath, name: `${svc.handlerModule}.js`, group: svc.name, language: 'js', content: consumerJs },
    { path: bugFile, name: 'catalog.js', group: svc.name, language: 'js', content: brokenContent, editable: true },
    { path: `src/${svc.name}/db.js`, name: 'db.js', group: svc.name, language: 'js', content: dbJs },
  ];

  const testContent = `const request = require('supertest');
const app = require('../${svc.name}/index');

describe('${method} ${svc.path}', () => {
  it('returns a ${field} for each requested ${svc.noun}', async () => {
    const res = await request(app).${methodLower}('${svc.path}?${key}s=A1,B2');

    expect(res.status).toBe(200);
    expect(res.body.items[0].${field}).toBeDefined();
  });
});
`;

  const errorLog = `[2024-01-15 14:31:02] ERROR: TypeError: Cannot read properties of undefined (reading '${field}')
    at ${fn} (${svc.handlerModule}.js:8)
[2024-01-15 14:31:02] ERROR: 500 Internal Server Error
[2024-01-15 14:31:16] ERROR: TypeError: Cannot read properties of undefined (reading '${field}')
    at ${fn} (${svc.handlerModule}.js:8)
[2024-01-15 14:31:28] WARN: 53 failed ${svc.noun} lookups in last 60s
[2024-01-15 14:31:30] CRIT: service down - alerting on-call
`;

  const diff = `commit ${svc.recentCommit}  refactor: simplify catalog.getItems to return rows
Author: a teammate    11 minutes ago

diff --git a/${bugFile} b/${bugFile}
@@ async function getItems(${key}s) {
   const rows = await db.fetchItems(${key}s);
-  return rows.reduce((acc, row) => { acc[row.${key}] = row; return acc; }, {});
+  return rows;
 }`;

  const parts: ArchetypeParts = {
    serviceFiles,
    bugFile,
    brokenContent,
    referenceFixContent,
    isFixed: (content) => {
      const buildsKeyed =
        new RegExp(`\\[\\s*\\w+\\.${key}\\s*\\]\\s*=`).test(content) ||
        /\.reduce\s*\(/.test(content) ||
        /Object\.fromEntries/.test(content);
      const returnsBareRows = /return\s+rows\s*(;|\n|\})/.test(content);
      return buildsKeyed && !returnsBareRows;
    },
    testFile: `src/tests/${svc.handlerModule}.test.js`,
    testName: `${method} ${svc.path} > returns a ${field} for each requested ${svc.noun}`,
    testContent,
    errorLog,
    failTrace: [
      `TypeError: Cannot read properties of undefined (reading '${field}')`,
      `at ${fn} (${consumerPath}:8)`,
    ],
    crashLine: `TypeError: Cannot read properties of undefined (reading '${field}')`,
    diff,
    liveAlerts: [
      `ERROR: TypeError: Cannot read properties of undefined (reading '${field}')`,
      'ERROR: 500 Internal Server Error',
      `    at ${fn} (${svc.handlerModule}.js:8)`,
      `WARN: 53 failed ${svc.noun} lookups in last 60s`,
      'ERROR: catalog.getItems() returned an array, not a lookup',
      'ERROR: 502 Bad Gateway from checkout-edge',
    ],
    symptom: `down, ${method} ${svc.path} is throwing 500s`,
    diagnoseObjective: 'Read the logs and find the failing endpoint',
    rootObjective: 'Trace past the crash site to the real cause',
  };

  return assembleScenario(ctx, svc, parts);
}

export const ARCHETYPES: Record<ArchetypeKind, (ctx: CompanyContext, svc: ServiceSpec) => GeneratedScenario> = {
  'missing-return': missingReturn,
  'zeroed-limit': zeroedLimit,
  'broken-shape': brokenShape,
};
