import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exampleCompany } from '../src/companyBrain/context.ts';
import type { IncidentProposal } from '../src/companyBrain/proposal.ts';
import { scriptedProposer } from '../src/companyBrain/proposer.ts';
import { generateFromProposer } from '../src/companyBrain/llmGenerator.ts';

const ctx = exampleCompany;
const svc = ctx.services[0]!;

const brokenPay = `const db = require('./db');

async function charge(input) {
  const result = await provider(input);
  await db.record(result);
  // success path is missing its return
}

async function provider(input) {
  return { ok: true, id: 'ch_' + input.id };
}

module.exports = { charge };
`;

const fixedPay = brokenPay.replace('  // success path is missing its return', '  return result;');

function validProposal(): IncidentProposal {
  return {
    archetypeHint: 'missing-return',
    symptom: 'down, POST /charges is throwing 500s',
    files: [
      {
        name: 'index.js',
        content:
          "const express = require('express');\nconst pay = require('./pay');\nconst app = express();\napp.post('/charges', async (req, res) => {\n  const result = await pay.charge(req.body);\n  res.json({ ok: result.ok });\n});\nmodule.exports = app;\n",
      },
      { name: 'pay.js', content: brokenPay },
    ],
    bugFileName: 'pay.js',
    referenceFixContent: fixedPay,
    // Statement-anchored so the token cannot be faked in a comment or string.
    acceptance: { mustMatch: ['(^|\\n)\\s*return result\\b'], mustNotMatch: [] },
    testFileName: 'pay.test.js',
    testName: 'POST /charges processes a charge and returns ok',
    testContent: "const app = require('../billing-service/index');\n// asserts 200 + ok\n",
    errorLog:
      "[14:31:02] ERROR: TypeError: Cannot read property 'ok' of undefined\n    at POST /charges (index.js:5)\n[14:31:03] ERROR: 500 Internal Server Error\n",
    failTrace: ["TypeError: Cannot read property 'ok' of undefined", 'at POST /charges (index.js:5)'],
    crashLine: "TypeError: Cannot read property 'ok' of undefined",
    diff: 'diff --git a/pay.js b/pay.js\n-  return result;\n+  // success path is missing its return',
    liveAlerts: ["ERROR: TypeError: Cannot read property 'ok' of undefined", 'ERROR: 500 Internal Server Error'],
    diagnoseObjective: 'Read the logs and find the failing endpoint',
    rootObjective: 'Trace it to the code that broke',
  };
}

test('a valid proposal is certified and returned on the first attempt', async () => {
  const result = await generateFromProposer(ctx, svc, scriptedProposer(validProposal()));
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 1);
  assert.ok(result.gen, 'should return a generated incident');
  assert.equal(result.gen!.scenario.serviceName, svc.name);
  assert.equal(result.validation?.ok, true);
});

test('an acceptance rule that would pass the broken code is rejected by the gate', async () => {
  const bad = validProposal();
  bad.acceptance = { mustMatch: [], mustNotMatch: [] }; // requires nothing, so it accepts the broken file
  const result = await generateFromProposer(ctx, svc, scriptedProposer(bad), { maxAttempts: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.gen, null, 'an uncertified incident must never be returned');
  assert.ok(result.history[0]!.failures.some((f) => /broken code is not accepted/.test(f.name)));
});

test('a reference fix that does not actually fix the bug is rejected', async () => {
  const bad = validProposal();
  // Differs from broken (so it compiles) but still lacks the return the rule requires.
  bad.referenceFixContent = brokenPay.replace(
    '  // success path is missing its return',
    '  // still no return here',
  );
  const result = await generateFromProposer(ctx, svc, scriptedProposer(bad), { maxAttempts: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.gen, null);
});

test('a proposal naming a bug file it did not supply fails to compile, not crash', async () => {
  const bad = validProposal();
  bad.bugFileName = 'ghost.js';
  const result = await generateFromProposer(ctx, svc, scriptedProposer(bad), { maxAttempts: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.history[0]!.compileError, 'compile error should be recorded');
});

test('the repair loop recovers: a rejected first attempt, a valid second one', async () => {
  const firstBad = validProposal();
  firstBad.acceptance = { mustMatch: [], mustNotMatch: [] };
  const proposer = scriptedProposer([firstBad, validProposal()]);

  const seenRepairFeedback: boolean[] = [];
  const result = await generateFromProposer(ctx, svc, proposer, {
    maxAttempts: 2,
    onAttempt: (r) => seenRepairFeedback.push(r.ok),
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.deepEqual(seenRepairFeedback, [false, true]);
  assert.ok(result.gen);
});
