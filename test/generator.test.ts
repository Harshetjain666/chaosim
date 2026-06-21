import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exampleCompany } from '../src/companyBrain/context.ts';
import { generateAll, generateScenario } from '../src/companyBrain/generator.ts';
import { validateGenerated } from '../src/companyBrain/validator.ts';

test('a generated incident is personalized to the company context', () => {
  const gen = generateScenario(exampleCompany);
  assert.match(gen.scenario.briefing, /Northwind/);
  assert.equal(gen.scenario.ceoName, 'Dana Park');
  assert.equal(gen.scenario.serviceName, 'billing-service');
  assert.ok(gen.scenario.files.some((f) => f.path.includes('billing-service')));
  assert.match(gen.scenario.ceoScript[0]!.text, /18 minutes/);
});

test('every archetype generates a distinct, solvable incident', () => {
  const all = generateAll(exampleCompany);
  // One per service, each a different bug shape.
  assert.equal(all.length, 3);
  const ids = new Set(all.map((g) => g.scenario.id));
  assert.equal(ids.size, 3);

  for (const gen of all) {
    const result = validateGenerated(gen);
    for (const c of result.checks) {
      assert.ok(c.pass, `[${gen.scenario.serviceName}] ${c.name} failed (${c.detail})`);
    }
    assert.equal(result.ok, true, `${gen.scenario.serviceName} did not validate`);
  }
});

test('the validator rejects a generation whose reference fix does not actually fix it', () => {
  // Check the negative for each archetype, not just the default one.
  for (const gen of generateAll(exampleCompany)) {
    const bad = { ...gen, validation: { ...gen.validation, referenceFixContent: gen.validation.brokenContent } };
    const result = validateGenerated(bad);
    assert.equal(result.ok, false, `${gen.scenario.serviceName} should have failed validation`);
    assert.ok(result.checks.some((c) => !c.pass));
  }
});
