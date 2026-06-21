import type { CompanyContext, ServiceSpec } from './context.ts';
import { PROPOSAL_JSON_SCHEMA, type IncidentProposal } from './proposal.ts';

/** A failing validator check fed back to the model on a repair attempt. */
export interface PriorFailure {
  name: string;
  detail: string;
}

export interface ProposeRequest {
  ctx: CompanyContext;
  svc: ServiceSpec;
  /** 1 on the first try; higher when repairing after a rejected proposal. */
  attempt: number;
  priorFailures: PriorFailure[];
}

/** The producer seam. Anything that yields an IncidentProposal can drive generation. */
export interface IncidentProposer {
  propose(req: ProposeRequest): Promise<IncidentProposal>;
}

/**
 * Deterministic proposer for tests and offline runs. Pass a single proposal, an
 * array indexed by attempt (clamped to the last), or a function of the request.
 */
export function scriptedProposer(
  script: IncidentProposal | IncidentProposal[] | ((req: ProposeRequest) => IncidentProposal),
): IncidentProposer {
  return {
    propose(req) {
      if (typeof script === 'function') return Promise.resolve(script(req));
      if (Array.isArray(script)) {
        const idx = Math.min(req.attempt - 1, script.length - 1);
        const picked = script[idx];
        if (!picked) return Promise.reject(new Error('scripted proposer ran out of proposals'));
        return Promise.resolve(picked);
      }
      return Promise.resolve(script);
    },
  };
}

export function buildSystemPrompt(): string {
  return [
    'You generate a single, realistic production incident for an engineering assessment.',
    'A candidate must be able to diagnose and fix it from logs and code under time pressure.',
    '',
    'Hard rules, all enforced by an automatic validator that will reject your output:',
    '- The bug file must be broken as shipped, and your referenceFixContent must make it pass.',
    '- referenceFixContent must differ from the broken file.',
    '- The acceptance rule is how we machine-check the fix. mustMatch/mustNotMatch are JS regex',
    '  sources, evaluated against the code with comments and string CONTENTS removed. So anchor',
    '  patterns to a statement position (e.g. "(^|\\n)\\s*return result\\b"), never rely on matching',
    '  text inside a comment or string, and do not write a pattern the broken code already satisfies.',
    '  The BROKEN code must fail the rule; only a real code fix may satisfy it.',
    '- Do NOT leak the solution. The corrected line(s) must not appear in the errorLog, liveAlerts,',
    '  failTrace, crashLine, briefing/symptom, KB, or any non-bug file. (The git diff may show the',
    '  change; that is legitimate diagnosis.)',
    '- Diagnostics must be coherent: the diff header (diff --git a/<path>) must name the bug file;',
    '  every file referenced in the errorLog, failTrace, and diff must be a real file you included;',
    '  the errorLog must reference a real file at a line that exists in it (e.g. app.js:12).',
    '- diagnoseObjective and rootObjective are shown to the candidate and must NOT name any source',
    '  file (no ".js"); they describe what to do, not where the bug is.',
    '- Keep the real cause one step away from the crash site when you can. It is more interesting.',
    'Return your answer only through the emit_incident tool.',
  ].join('\n');
}

export function buildUserPrompt(req: ProposeRequest): string {
  const { ctx, svc } = req;
  const lines = [
    `Company: ${ctx.company}`,
    `CEO persona: ${ctx.ceo.name}, ${ctx.ceo.role}`,
    `Service: ${svc.name} (${svc.short})`,
    `Endpoint: ${svc.method.toUpperCase()} ${svc.path}`,
    `Handler: ${svc.handlerModule}.${svc.handlerFn}()`,
    `One unit of work is a "${svc.noun}". Recent suspicious commit: ${svc.recentCommit}.`,
  ];
  if (svc.archetype) lines.push(`Preferred bug shape: ${svc.archetype}.`);
  if (ctx.glossary?.length) lines.push(`Use this company vocabulary where natural: ${ctx.glossary.join(', ')}.`);
  lines.push('', 'Produce one incident for this service via emit_incident.');
  if (req.priorFailures.length) {
    lines.push(
      '',
      `Your previous attempt was REJECTED by the validator. Fix these and resubmit:`,
      ...req.priorFailures.map((f) => `- ${f.name}${f.detail ? ` (${f.detail})` : ''}`),
    );
  }
  return lines.join('\n');
}

function readApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.ANTHROPIC_API_KEY;
}

export interface AnthropicProposerOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  /** Override for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The production proposer. Calls the Anthropic Messages API with a forced tool
 * call so the response is shaped like an IncidentProposal. Uses fetch directly,
 * so the repo needs no SDK dependency. This runs in a Node/build context, never
 * in the browser (the API key must not ship to a client).
 */
export function anthropicProposer(opts: AnthropicProposerOptions = {}): IncidentProposer {
  const model = opts.model ?? 'claude-opus-4-8';
  const maxTokens = opts.maxTokens ?? 4096;
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    async propose(req) {
      const apiKey = readApiKey(opts.apiKey);
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

      const res = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: buildUserPrompt(req) }],
          tools: [
            {
              name: 'emit_incident',
              description: 'Emit one generated incident for the service.',
              input_schema: PROPOSAL_JSON_SCHEMA,
            },
          ],
          tool_choice: { type: 'tool', name: 'emit_incident' },
        }),
      });

      if (!res.ok) {
        throw new Error(`anthropic request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as { content?: Array<{ type: string; input?: unknown }> };
      const block = data.content?.find((b) => b.type === 'tool_use');
      if (!block?.input) throw new Error('no tool_use block in the model response');
      return block.input as IncidentProposal;
    },
  };
}
