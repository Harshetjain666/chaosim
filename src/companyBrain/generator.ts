import type { CompanyContext } from './context.ts';
import { ARCHETYPES } from './archetypes.ts';
import type { GeneratedScenario } from './scaffold.ts';

export type { GeneratedScenario } from './scaffold.ts';

/**
 * Generate a personalized incident for one of the company's services. The
 * archetype (the bug shape) comes from the service spec; the validator then
 * certifies the result before it is ever served to a candidate.
 */
export function generateScenario(ctx: CompanyContext, opts?: { serviceIndex?: number }): GeneratedScenario {
  const svc = ctx.services[opts?.serviceIndex ?? 0];
  if (!svc) throw new Error('company context has no services to generate from');
  const build = ARCHETYPES[svc.archetype ?? 'missing-return'];
  return build(ctx, svc);
}

/** Generate one incident per service in the company context. */
export function generateAll(ctx: CompanyContext): GeneratedScenario[] {
  return ctx.services.map((_, i) => generateScenario(ctx, { serviceIndex: i }));
}
