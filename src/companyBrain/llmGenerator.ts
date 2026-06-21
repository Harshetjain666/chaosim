import type { CompanyContext, ServiceSpec } from './context.ts';
import type { GeneratedScenario } from './scaffold.ts';
import { compileProposal } from './proposal.ts';
import type { IncidentProposer, PriorFailure, ProposeRequest } from './proposer.ts';
import { type ValidationResult, validateGenerated } from './validator.ts';

/**
 * Drive an LLM proposer through the validator gate. The model proposes; we
 * compile and certify. If a proposal is rejected, the failing checks are fed
 * back and the model gets another attempt (a self-repair loop). Nothing that
 * fails the gate is ever returned as usable. This is the whole point: the
 * generator can be creative and occasionally wrong, and the deterministic
 * engine is what makes its output trustworthy.
 */

export interface AttemptRecord {
  attempt: number;
  ok: boolean;
  failures: PriorFailure[];
  /** Set when compilation threw before validation could run. */
  compileError?: string;
}

export interface LlmGenerationResult {
  ok: boolean;
  /** The certified incident, or null if every attempt was rejected. */
  gen: GeneratedScenario | null;
  attempts: number;
  validation: ValidationResult | null;
  history: AttemptRecord[];
}

export interface GenerateOptions {
  maxAttempts?: number;
  onAttempt?: (record: AttemptRecord) => void;
}

export async function generateFromProposer(
  ctx: CompanyContext,
  svc: ServiceSpec,
  proposer: IncidentProposer,
  opts: GenerateOptions = {},
): Promise<LlmGenerationResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const history: AttemptRecord[] = [];
  let priorFailures: PriorFailure[] = [];
  let lastValidation: ValidationResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const req: ProposeRequest = { ctx, svc, attempt, priorFailures };
    const proposal = await proposer.propose(req);

    let gen: GeneratedScenario;
    try {
      gen = compileProposal(ctx, svc, proposal);
    } catch (err) {
      const compileError = err instanceof Error ? err.message : String(err);
      priorFailures = [{ name: 'proposal could not be compiled', detail: compileError }];
      lastValidation = null;
      const record: AttemptRecord = { attempt, ok: false, failures: priorFailures, compileError };
      history.push(record);
      opts.onAttempt?.(record);
      continue;
    }

    const validation = validateGenerated(gen);
    lastValidation = validation;
    const failures = validation.checks.filter((c) => !c.pass).map((c) => ({ name: c.name, detail: c.detail }));
    const record: AttemptRecord = { attempt, ok: validation.ok, failures };
    history.push(record);
    opts.onAttempt?.(record);

    if (validation.ok) {
      return { ok: true, gen, attempts: attempt, validation, history };
    }
    priorFailures = failures;
  }

  return { ok: false, gen: null, attempts: maxAttempts, validation: lastValidation, history };
}
