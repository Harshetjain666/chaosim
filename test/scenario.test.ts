import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paymentOutage } from '../src/scenario/paymentOutage.ts';
import { runCommand } from '../src/state/terminal.ts';
import { evaluate } from '../src/state/evaluation.ts';
import type { IncidentState } from '../src/state/types.ts';

const sc = paymentOutage;
const original = sc.files.find((f) => f.path === sc.bugFile)!.content;
const fixed = original.replace('  // the success path ends here', '  return result;');

function baseState(over: Partial<IncidentState> = {}): IncidentState {
  return {
    started: true,
    playerName: 'Tester',
    elapsed: 0,
    stageIndex: 0,
    fileContents: { [sc.bugFile]: original },
    openTabs: [],
    activeTab: null,
    chat: [],
    ceoSentIds: [],
    terminal: [],
    testsRun: false,
    testsPassed: false,
    restarted: false,
    resolved: false,
    failedRequests: 0,
    revenueLostCents: 0,
    logFeed: [],
    severity: 1,
    activeEvent: null,
    eventQueue: [],
    firedEventIds: [],
    submitted: false,
    evaluation: null,
    tFirstDiagnose: null,
    tFirstCodeOpen: null,
    tFirstTest: null,
    tFirstAction: null,
    tResolve: null,
    ceoReplyTimes: [],
    commandCount: 0,
    fileOpenCount: 0,
    editCount: 0,
    openedKb: false,
    openedBugFile: false,
    testsBeforeFix: 0,
    failedCommandCount: 0,
    repliedUnderPressure: false,
    ...over,
  };
}

test('the broken code does not satisfy the fix check', () => {
  assert.equal(sc.isFixed(original), false);
});

test('returning the provider result is a valid fix', () => {
  assert.equal(sc.isFixed(fixed), true);
});

test('npm test fails on the broken code and passes once fixed', () => {
  const fail = runCommand('npm test', sc, baseState());
  assert.equal(fail.flags.testsPassed, false);

  const pass = runCommand('npm test', sc, baseState({ fileContents: { [sc.bugFile]: fixed } }));
  assert.equal(pass.flags.testsPassed, true);
});

test('restart only mitigates once the code is fixed and tests pass', () => {
  const stillBroken = runCommand('restart payment-service', sc, baseState({ testsPassed: false }));
  assert.equal(stillBroken.flags.restarted, undefined);
  assert.match(stillBroken.out.join('\n'), /still broken/);

  const mitigated = runCommand('restart payment-service', sc, baseState({ fileContents: { [sc.bugFile]: fixed }, testsPassed: true }));
  assert.equal(mitigated.flags.restarted, true);
  assert.match(mitigated.out.join('\n'), /incident mitigated/);
});

test('cat of the error log counts as diagnosis', () => {
  const r = runCommand('cat src/logs/error.log', sc, baseState());
  assert.equal(r.flags.diagnosed, true);
  assert.match(r.out.join('\n'), /index\.js:11/);
});

test('a resolved, methodical run outscores an unresolved one', () => {
  const good = evaluate(
    baseState({
      resolved: true,
      tResolve: 200,
      testsPassed: true,
      tFirstDiagnose: 10,
      tFirstCodeOpen: 40,
      ceoReplyTimes: [25, 120],
    }),
    sc,
  );
  const bad = evaluate(baseState({ resolved: false, elapsed: 1080 }), sc);

  assert.ok(good.score > bad.score);
  assert.equal(good.resolved, true);
  assert.ok(good.strengths.length > 0);
  assert.ok(bad.flags.length > 0);
});

test('going silent on the CEO is flagged', () => {
  const e = evaluate(baseState({ resolved: true, tResolve: 300, testsPassed: true, ceoReplyTimes: [] }), sc);
  assert.ok(e.flags.some((f) => /Communication/.test(f)));
});

test('the report is five weighted categories that sum to one', () => {
  const e = evaluate(
    baseState({
      resolved: true,
      tResolve: 200,
      testsPassed: true,
      testsBeforeFix: 1,
      restarted: true,
      tFirstDiagnose: 10,
      tFirstCodeOpen: 40,
      openedBugFile: true,
      openedKb: true,
      ceoReplyTimes: [20, 90],
      repliedUnderPressure: true,
    }),
    sc,
  );
  assert.equal(e.categories.length, 5);
  const totalWeight = e.categories.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(totalWeight - 1) < 1e-9, `weights should sum to 1, got ${totalWeight}`);
  const diagnosis = e.categories.find((c) => c.key === 'diagnosis')!;
  assert.ok(diagnosis.score >= 90, `methodical diagnosis should score high, got ${diagnosis.score}`);
  assert.ok(e.score >= 85, `a clean run should grade high, got ${e.score}`);
});
