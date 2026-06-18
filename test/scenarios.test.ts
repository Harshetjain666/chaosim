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
    assert.ok(sc.files.some((f) => f.path.endsWith('error.log')), `${sc.code} has an error log`);
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

test('terminal output is scenario-driven, not hardcoded', () => {
  const orders = SCENARIOS.find((s) => s.id === 'orders-validation')!;
  const original = orders.files.find((f) => f.path === orders.bugFile)!.content;
  const fail = runCommand('npm test', orders, state(orders.bugFile, original));
  assert.match(fail.out.join('\n'), /orders\.test\.js/);
  assert.match(fail.out.join('\n'), /validate\.js/);
});
