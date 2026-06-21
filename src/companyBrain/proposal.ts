import type { Language, SourceFile } from '../scenario/types.ts';
import type { CompanyContext, ServiceSpec } from './context.ts';
import { type ArchetypeParts, type GeneratedScenario, assembleScenario } from './scaffold.ts';

/**
 * The contract with the LLM. A proposal is UNTRUSTED: the model describes a bug,
 * its fix, and the supporting incident artifacts, but it never hands us
 * executable logic. "Is this fixed?" is expressed as declarative data (an
 * acceptance rule of regular expressions), which our own trusted code compiles
 * into the isFixed predicate. The validator then certifies the whole thing
 * before it can ever reach a candidate. The model proposes; the engine decides.
 */

export interface ProposalFile {
  /** Bare file name, e.g. 'billing.js'. Paths are assigned by us. */
  name: string;
  content: string;
  /** Whether the candidate may edit it. The bug file is always made editable. */
  editable?: boolean;
}

/**
 * Declarative "is it fixed" check. Compiled into a predicate by our code, so the
 * model cannot ship code we would have to run. Fixed code must match every
 * pattern in mustMatch and none in mustNotMatch.
 */
export interface AcceptanceRule {
  mustMatch: string[];
  mustNotMatch: string[];
}

export interface IncidentProposal {
  /** Freeform note on the bug shape, for logging only. */
  archetypeHint?: string;
  symptom: string;
  /** Source files for the failing service. One of them is the bug file. */
  files: ProposalFile[];
  /** Which file in `files` holds the root cause. */
  bugFileName: string;
  /** The corrected contents of the bug file. */
  referenceFixContent: string;
  acceptance: AcceptanceRule;
  testFileName: string;
  testName: string;
  testContent: string;
  errorLog: string;
  failTrace: string[];
  crashLine: string;
  diff: string;
  liveAlerts: string[];
  diagnoseObjective: string;
  rootObjective: string;
}

const MAX_PATTERN_LEN = 240;

/** Compile an untrusted regex source, with guards against abuse. */
function safePattern(source: string): RegExp {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('acceptance pattern must be a non-empty string');
  }
  if (source.length > MAX_PATTERN_LEN) {
    throw new Error(`acceptance pattern exceeds ${MAX_PATTERN_LEN} chars`);
  }
  return new RegExp(source);
}

/**
 * Remove comments and the contents of string literals so acceptance can only
 * match real, executable code. Without this, a candidate could satisfy the fix
 * check by pasting the required token into a comment or a string. Crude but
 * sufficient: the engine resolves on isFixed, so isFixed must ignore non-code.
 */
function stripToCode(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '$1$1');
}

/**
 * Turn a declarative acceptance rule into the isFixed predicate, evaluated
 * against code with comments and string contents removed. A rule that requires
 * nothing would accept the broken code; we do not special-case that here
 * because the validator's "broken code is not accepted" check rejects such a
 * proposal anyway. The gate is the safety net.
 */
export function compileAcceptance(rule: AcceptanceRule): (content: string) => boolean {
  const must = (rule.mustMatch ?? []).map(safePattern);
  const mustNot = (rule.mustNotMatch ?? []).map(safePattern);
  return (content) => {
    const code = stripToCode(content);
    return must.every((r) => r.test(code)) && mustNot.every((r) => !r.test(code));
  };
}

function languageOf(name: string): Language {
  if (name.endsWith('.env') || name === '.env' || name.endsWith('env.example')) return 'env';
  if (name.endsWith('.md')) return 'md';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
  if (name.endsWith('.log')) return 'log';
  return 'js';
}

/**
 * Compile an untrusted proposal into a runnable GeneratedScenario by mapping it
 * onto the same scaffold the hand-authored archetypes use. Throws if the
 * proposal is internally inconsistent (e.g. names a bug file it did not supply);
 * the generator treats a throw as a failed attempt.
 */
export function compileProposal(ctx: CompanyContext, svc: ServiceSpec, p: IncidentProposal): GeneratedScenario {
  if (!Array.isArray(p.files) || p.files.length === 0) {
    throw new Error('proposal supplied no files');
  }
  const brokenFile = p.files.find((f) => f.name === p.bugFileName);
  if (!brokenFile) {
    throw new Error(`bugFileName '${p.bugFileName}' is not among the proposed files`);
  }
  if (p.referenceFixContent === brokenFile.content) {
    throw new Error('reference fix is identical to the broken file');
  }

  const bugFile = `src/${svc.name}/${p.bugFileName}`;
  const serviceFiles: SourceFile[] = p.files.map((f) => ({
    path: `src/${svc.name}/${f.name}`,
    name: f.name,
    group: svc.name,
    language: languageOf(f.name),
    content: f.content,
    editable: f.name === p.bugFileName ? true : f.editable,
  }));

  const parts: ArchetypeParts = {
    serviceFiles,
    bugFile,
    brokenContent: brokenFile.content,
    referenceFixContent: p.referenceFixContent,
    isFixed: compileAcceptance(p.acceptance),
    testFile: `src/tests/${p.testFileName}`,
    testName: p.testName,
    testContent: p.testContent,
    errorLog: p.errorLog,
    failTrace: p.failTrace,
    crashLine: p.crashLine,
    diff: p.diff,
    liveAlerts: p.liveAlerts,
    symptom: p.symptom,
    diagnoseObjective: p.diagnoseObjective,
    rootObjective: p.rootObjective,
  };

  return assembleScenario(ctx, svc, parts);
}

/**
 * JSON Schema handed to the model as a forced tool, so the response comes back
 * already shaped like an IncidentProposal. Kept in sync with the interface above.
 */
export const PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'symptom',
    'files',
    'bugFileName',
    'referenceFixContent',
    'acceptance',
    'testFileName',
    'testName',
    'testContent',
    'errorLog',
    'failTrace',
    'crashLine',
    'diff',
    'liveAlerts',
    'diagnoseObjective',
    'rootObjective',
  ],
  properties: {
    archetypeHint: { type: 'string', description: 'Short note on the bug shape, for logging only.' },
    symptom: { type: 'string', description: "Fills the briefing, e.g. 'throwing 500s on POST /charges'." },
    files: {
      type: 'array',
      minItems: 1,
      description: 'Source files for the failing service. One is the bug file; include the entrypoint and any consumer.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'content'],
        properties: {
          name: { type: 'string', description: "Bare file name, e.g. 'billing.js'." },
          content: { type: 'string' },
          editable: { type: 'boolean' },
        },
      },
    },
    bugFileName: { type: 'string', description: 'Which file in files holds the root cause.' },
    referenceFixContent: { type: 'string', description: 'The corrected contents of the bug file. Must differ from the broken version.' },
    acceptance: {
      type: 'object',
      additionalProperties: false,
      required: ['mustMatch', 'mustNotMatch'],
      description: 'Declarative isFixed: fixed code matches every mustMatch pattern and no mustNotMatch pattern. Choose patterns that the broken code fails and only a real fix satisfies.',
      properties: {
        mustMatch: { type: 'array', items: { type: 'string' }, description: 'JavaScript regex sources.' },
        mustNotMatch: { type: 'array', items: { type: 'string' }, description: 'JavaScript regex sources.' },
      },
    },
    testFileName: { type: 'string', description: "e.g. 'billing.test.js'." },
    testName: { type: 'string' },
    testContent: { type: 'string' },
    errorLog: { type: 'string', description: 'Realistic error log. Must reference a file and line, e.g. index.js:10.' },
    failTrace: { type: 'array', items: { type: 'string' } },
    crashLine: { type: 'string' },
    diff: { type: 'string', description: 'git diff of the bad change. Must name the bug file.' },
    liveAlerts: { type: 'array', items: { type: 'string' } },
    diagnoseObjective: { type: 'string', description: 'Objective text. Must not name a source file (no .js).' },
    rootObjective: { type: 'string', description: 'Objective text. Must not name a source file (no .js).' },
  },
} as const;
