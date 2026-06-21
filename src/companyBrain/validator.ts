import { applyAction, initialState } from '../state/engine.ts';
import type { IncidentState } from '../state/types.ts';
import type { Scenario } from '../scenario/types.ts';
import type { GeneratedScenario } from './generator.ts';

/**
 * The safety gate. A generated incident reaches a candidate only if it is, all
 * at once:
 *   - solvable: the planted bug fails, the intended fix resolves it in time, and
 *     it never resolves on its own (proven headlessly through the pure engine);
 *   - non-gameable: the fix cannot be faked by editing a comment, a string, or
 *     by deleting a marker; "is it fixed" must key on real code;
 *   - non-leaky: the solution does not appear in any artifact the candidate
 *     reads (logs, alerts, briefing, other files);
 *   - coherent: the diff, error log, and trace point at files that actually
 *     exist, at lines that actually exist, and name the real bug file.
 * Anything that fails any of these is rejected. The model proposes; the engine
 * decides. These checks are the trust boundary on untrusted generation.
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

const MIN_SOLVE_SECONDS = 120;

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

function errorLogPath(gen: GeneratedScenario): string | undefined {
  return gen.scenario.files.find((f) => f.path.endsWith('error.log'))?.path;
}

function errorLogContent(scenario: Scenario): string {
  return scenario.files.find((f) => f.path.endsWith('error.log'))?.content ?? '';
}

/** Crudely remove JS comments so we can test whether deleting them "fixes" the bug. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Crudely blank string literals so we can test whether a token hidden in a string "fixes" the bug. */
function stripStrings(src: string): string {
  return src.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '$1$1');
}

/** The lines added by the fix: present (trimmed) in the fix, absent in the broken file, and meaty enough to matter. */
function addedFixLines(broken: string, fix: string): string[] {
  const brokenSet = new Set(broken.split('\n').map((l) => l.trim()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of fix.split('\n')) {
    const line = raw.trim();
    if (brokenSet.has(line) || seen.has(line)) continue;
    if (line.length < 8 || !/[A-Za-z]/.test(line) || /^[}\])(;,\s]+$/.test(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** Every candidate-visible text EXCEPT the git diff (the diff is allowed to show the change; that is diagnosis). */
function visibleArtifacts(scenario: Scenario): string[] {
  const texts: string[] = [scenario.briefing, scenario.crashLine, scenario.recoveryAlert, ...scenario.failTrace, ...scenario.liveAlerts, ...scenario.deploys];
  for (const a of scenario.kb) texts.push(a.title, a.body);
  for (const m of scenario.ceoScript) texts.push(m.text);
  for (const f of scenario.files) {
    if (f.path !== scenario.bugFile) texts.push(f.content);
  }
  return texts;
}

/** All `name.js` (optionally `:line`) references in a blob. */
function jsReferences(text: string): Array<{ base: string; line: number | null }> {
  const out: Array<{ base: string; line: number | null }> = [];
  const re = /([\w.\-]+\.js)(?::(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ base: m[1]!, line: m[2] ? Number(m[2]) : null });
  }
  return out;
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
  const { brokenContent, referenceFixContent } = validation;
  const isFixed = scenario.isFixed;
  const checks: ValidationCheck[] = [];
  const add = (name: string, pass: boolean, detail = '') => checks.push({ name, pass, detail });

  // --- solvability -----------------------------------------------------------
  add('broken code is not accepted as a fix', !isFixed(brokenContent));
  add('the reference fix is accepted', isFixed(referenceFixContent));

  const solved = solveWithFix(gen);
  add('a correct fix resolves the incident', solved.resolved, `tResolve=${solved.tResolve}`);
  add('the fix passes the test suite', solved.testsPassed);
  add(
    'resolves within the deadline',
    solved.resolved && (solved.tResolve ?? Number.POSITIVE_INFINITY) <= scenario.deadlineSeconds,
    `deadline=${scenario.deadlineSeconds}s`,
  );
  add('the deadline allows a real solve', scenario.deadlineSeconds >= MIN_SOLVE_SECONDS, `deadline=${scenario.deadlineSeconds}s`);

  const passive = passiveRun(gen);
  add('the broken service does not resolve on its own', !passive.resolved && !passive.testsPassed);

  // --- non-gameable acceptance ----------------------------------------------
  // The fix must require real code, not a deleted comment, a blanked string, or
  // the fix text pasted into a comment or string literal.
  add('deleting comments alone does not pass', !isFixed(stripComments(brokenContent)));
  add('blanking strings alone does not pass', !isFixed(stripStrings(brokenContent)));

  const fixLines = addedFixLines(brokenContent, referenceFixContent);
  const gameable = fixLines.find(
    (line) => isFixed(`${brokenContent}\n// ${line}`) || isFixed(`${brokenContent}\nvar __leak = ${JSON.stringify(line)};`),
  );
  add('the fix cannot be faked in a comment or string', gameable === undefined, gameable ? `via: ${gameable}` : '');

  // --- no solution leakage ---------------------------------------------------
  const artifacts = visibleArtifacts(scenario);
  const leaked = fixLines.find((line) => artifacts.some((t) => t.includes(line)));
  add('the solution does not leak in candidate-facing text', leaked === undefined, leaked ? `leaked line: ${leaked}` : '');

  // --- diagnostic coherence --------------------------------------------------
  const bugBase = baseName(scenario.bugFile);
  const fileBases = new Set(scenario.files.map((f) => baseName(f.path)));

  const header = scenario.diff.match(/diff --git a\/(\S+) b\/(\S+)/) ?? scenario.diff.match(/\+\+\+ b\/(\S+)/);
  const diffPath = header ? header[header.length - 1]! : '';
  add('the diff header names the bug file', baseName(diffPath) === bugBase, diffPath ? `diff names ${baseName(diffPath)}` : 'no diff --git header');

  const errorLog = errorLogContent(scenario);
  const diagnosticRefs = [...jsReferences(errorLog), ...jsReferences(scenario.failTrace.join('\n')), ...jsReferences(scenario.diff)];
  const phantom = diagnosticRefs.find((r) => !fileBases.has(r.base));
  add('diagnostic clues only reference real files', phantom === undefined, phantom ? `phantom: ${phantom.base}` : '');

  const logRefs = jsReferences(errorLog);
  const anchored = logRefs.some((r) => {
    if (r.line === null) return false;
    const file = scenario.files.find((f) => baseName(f.path) === r.base);
    if (!file) return false;
    const lineCount = file.content.split('\n').length;
    return r.line >= 1 && r.line <= lineCount;
  });
  add('the error log points at a real line', anchored);

  add('objectives do not name a source file', !scenario.objectives.some((o) => /\.js\b/.test(o.label)));

  return { ok: checks.every((c) => c.pass), checks };
}
