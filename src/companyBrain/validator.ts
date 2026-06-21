import { applyAction, initialState } from '../state/engine.ts';
import type { IncidentState } from '../state/types.ts';
import type { GeneratedScenario } from './generator.ts';

/**
 * The safety gate. A generated incident is only trustworthy if it is provably
 * solvable and provably broken until fixed. Because the engine is pure and
 * deterministic, we run the incident headlessly: confirm the planted bug fails,
 * confirm the intended fix resolves it inside the deadline, and confirm it does
 * not resolve on its own. Anything that fails validation never reaches a
 * candidate.
 */

export interface ValidationCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
}

function errorLogPath(gen: GeneratedScenario): string | undefined {
  return gen.scenario.files.find((f) => f.path.endsWith('error.log'))?.path;
}

/** Drive a perfect solution through the engine and return the final state. */
function solveWithFix(gen: GeneratedScenario): IncidentState {
  const { scenario, validation } = gen;
  let s = initialState(scenario);
  s = applyAction(scenario, s, { type: 'start', name: 'Validator' });
  const el = errorLogPath(gen);
  if (el) s = applyAction(scenario, s, { type: 'openFile', path: el });
  s = applyAction(scenario, s, { type: 'openFile', path: scenario.bugFile });
  s = applyAction(scenario, s, { type: 'editFile', path: scenario.bugFile, content: validation.referenceFixContent });
  s = applyAction(scenario, s, { type: 'runCommand', command: 'npm test' });
  s = applyAction(scenario, s, { type: 'runCommand', command: `restart ${scenario.serviceName}` });
  return s;
}

/** Drive an attempt that never fixes the bug and return the final state. */
function passiveRun(gen: GeneratedScenario): IncidentState {
  const { scenario } = gen;
  let s = initialState(scenario);
  s = applyAction(scenario, s, { type: 'start', name: 'Validator' });
  s = applyAction(scenario, s, { type: 'runCommand', command: 'npm test' });
  s = applyAction(scenario, s, { type: 'runCommand', command: `restart ${scenario.serviceName}` });
  return s;
}

export function validateGenerated(gen: GeneratedScenario): ValidationResult {
  const { scenario, validation } = gen;
  const checks: ValidationCheck[] = [];
  const add = (name: string, pass: boolean, detail = '') => checks.push({ name, pass, detail });

  add('broken code is not accepted as a fix', !scenario.isFixed(validation.brokenContent));
  add('the reference fix is accepted', scenario.isFixed(validation.referenceFixContent));

  const solved = solveWithFix(gen);
  add('a correct fix resolves the incident', solved.resolved, `tResolve=${solved.tResolve}`);
  add('the fix passes the test suite', solved.testsPassed);
  add(
    'resolves within the deadline',
    solved.resolved && (solved.tResolve ?? Number.POSITIVE_INFINITY) <= scenario.deadlineSeconds,
    `deadline=${scenario.deadlineSeconds}s`,
  );

  const passive = passiveRun(gen);
  add('the broken service does not resolve on its own', !passive.resolved && !passive.testsPassed);

  const errorLog = scenario.files.find((f) => f.path.endsWith('error.log'))?.content ?? '';
  const bugBaseName = scenario.bugFile.split('/').pop() ?? scenario.bugFile;
  add('git diff points at the bug file', scenario.diff.includes(bugBaseName));
  add('the error log references a file and line', /\.js:\d+/.test(errorLog));
  add('objectives do not name the bug file', !scenario.objectives.some((o) => /\.js\b/.test(o.label)));

  return { ok: checks.every((c) => c.pass), checks };
}
