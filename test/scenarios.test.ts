import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS } from '../src/scenario/index.ts';
import { runCommand } from '../src/state/terminal.ts';

function state(bugFile: string, content: string) {
  return {
    playerName: 'T',
    fileContents: { [bugFile]: content },
    testsPassed: false,
    testsRun: false,
    restarted: false,
    resolved: false,
  } as never;
}

test('every scenario ships broken with a reachable fix and full metadata', () => {
  assert.ok(SCENARIOS.length >= 2, 'expected at least two incidents');
  for (const sc of SCENARIOS) {
    const file = sc.files.find((f) => f.path === sc.bugFile);
    assert.ok(file, `${sc.code} has a bug file`);
    assert.equal(sc.isFixed(file!.content), false, `${sc.code} should start broken`);
    assert.ok(sc.objectives.length >= 4, `${sc.code} has objectives`);
    assert.ok(sc.liveAlerts.length >= 1, `${sc.code} has live alerts`);
    assert.ok(sc.deploys.length >= 1, `${sc.code} has a deploy log`);
    assert.ok(sc.diff.length > 0, `${sc.code} has a diff for git diff`);
    assert.ok(sc.files.some((f) => f.path.endsWith('error.log')), `${sc.code} has an error log`);
    assert.ok(!sc.objectives.some((o) => /\.js\b/.test(o.label)), `${sc.code} objectives should not name the bug file`);
  }
});

test('git diff reveals the bad change and counts as diagnosis', () => {
  for (const sc of SCENARIOS) {
    const original = sc.files.find((f) => f.path === sc.bugFile)!.content;
    const r = runCommand('git diff', sc, state(sc.bugFile, original));
    assert.equal(r.flags.diagnosed, true, `${sc.code} git diff should count as diagnosis`);
    assert.match(r.out.join('\n'), /commit|@@/, `${sc.code} git diff should show a diff`);
  }
});

test('orders incident: the zeroed limit fails the test, a real limit passes', () => {
  const sc = SCENARIOS.find((s) => s.id === 'orders-validation')!;
  const original = sc.files.find((f) => f.path === sc.bugFile)!.content;
  const fixed = original.replace('const MAX_ORDER_CENTS = 0;', 'const MAX_ORDER_CENTS = 5000000;');

  assert.equal(sc.isFixed(original), false);
  assert.equal(sc.isFixed(fixed), true);
  assert.equal(runCommand('npm test', sc, state(sc.bugFile, original)).flags.testsPassed, false);
  assert.equal(runCommand('npm test', sc, state(sc.bugFile, fixed)).flags.testsPassed, true);
});

test('inventory incident: the raw-array return fails, a keyed shape passes', () => {
  const sc = SCENARIOS.find((s) => s.id === 'inventory-outage')!;
  const original = sc.files.find((f) => f.path === sc.bugFile)!.content;
  const fixed = original.replace('  return rows;', '  const bySku = {};\n  for (const row of rows) bySku[row.sku] = row;\n  return bySku;');

  assert.equal(sc.isFixed(original), false);
  assert.equal(sc.isFixed(fixed), true);
  assert.equal(runCommand('npm test', sc, state(sc.bugFile, fixed)).flags.testsPassed, true);
});

test('inventory incident misdirects: the trace points away from the bug file', () => {
  const sc = SCENARIOS.find((s) => s.id === 'inventory-outage')!;
  const errorLog = sc.files.find((f) => f.path.endsWith('error.log'))!.content;
  assert.match(errorLog, /inventory\.js/, 'the crash is reported in inventory.js');
  assert.ok(sc.bugFile.endsWith('catalog.js'), 'but the root cause is in catalog.js');
  assert.match(sc.diff, /catalog\.js/, 'and git diff points at the real cause');
});

test('orders verifier rejects a cleared or stubbed file (no false positive)', () => {
  const sc = SCENARIOS.find((s) => s.id === 'orders-validation')!;
  assert.equal(sc.isFixed(''), false);
  assert.equal(sc.isFixed('   \n  '), false);
  assert.equal(sc.isFixed('function validateOrder(order){ /* todo */ }\nconst MAX_ORDER_CENTS = 0;'), false);
});

test('inventory verifier: reduce passes, Map is rejected to match the consumer', () => {
  const sc = SCENARIOS.find((s) => s.id === 'inventory-outage')!;
  const original = sc.files.find((f) => f.path === sc.bugFile)!.content;
  const reduceFix = original.replace('  return rows;', '  return rows.reduce((acc, r) => { acc[r.sku] = r; return acc; }, {});');
  const mapFix = original.replace('  return rows;', '  return new Map(rows.map((r) => [r.sku, r]));');

  assert.equal(sc.isFixed(reduceFix), true, 'a reduce-to-object fix should pass');
  assert.equal(sc.isFixed(mapFix), false, 'a Map fix should fail: the consumer uses bracket access');
  assert.equal(sc.isFixed(''), false);
});

test('terminal output is scenario-driven, not hardcoded', () => {
  const orders = SCENARIOS.find((s) => s.id === 'orders-validation')!;
  const original = orders.files.find((f) => f.path === orders.bugFile)!.content;
  const fail = runCommand('npm test', orders, state(orders.bugFile, original));
  assert.match(fail.out.join('\n'), /orders\.test\.js/);
  assert.match(fail.out.join('\n'), /validate\.js/);
});
