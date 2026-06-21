/**
 * Real-world entry point for the LLM-backed generator. Calls the Anthropic API
 * to propose an incident for one of the example company's services, runs it
 * through the deterministic validator gate, and prints the certified scenario.
 *
 *   ANTHROPIC_API_KEY=sk-... node scripts/generateIncident.ts [serviceIndex]
 *
 * This lives outside src/ so it never enters the browser bundle: the API key
 * must stay server side. The app itself still ships the deterministic templated
 * incidents; this is the pipeline that would produce new, validated ones.
 */
import { exampleCompany } from '../src/companyBrain/context.ts';
import { anthropicProposer } from '../src/companyBrain/proposer.ts';
import { generateFromProposer } from '../src/companyBrain/llmGenerator.ts';

async function main(): Promise<void> {
  const idx = Number(process.argv[2] ?? 0);
  const svc = exampleCompany.services[idx];
  if (!svc) {
    console.error(`no service at index ${idx}; the company has ${exampleCompany.services.length}`);
    process.exit(1);
    return;
  }

  console.error(`Generating an incident for ${svc.name} at ${exampleCompany.company}...`);
  const result = await generateFromProposer(exampleCompany, svc, anthropicProposer(), {
    maxAttempts: 3,
    onAttempt: (r) =>
      console.error(
        r.ok
          ? `  attempt ${r.attempt}: certified`
          : `  attempt ${r.attempt}: rejected (${r.compileError ?? r.failures.map((f) => f.name).join('; ')})`,
      ),
  });

  if (!result.ok || !result.gen) {
    console.error(`\nGave up after ${result.attempts} attempts. The validator never certified a proposal.`);
    process.exit(1);
    return;
  }

  // isFixed is a function and is intentionally dropped by JSON; the served
  // scenario carries only data. The acceptance logic stays in our code.
  console.log(JSON.stringify(result.gen.scenario, null, 2));
  console.error(`\nCertified in ${result.attempts} attempt(s). Checks: ${result.validation?.checks.length} passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
