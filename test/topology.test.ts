import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paymentOutage } from '../src/scenario/paymentOutage.ts';
import { initialState } from '../src/state/engine.ts';
import type { IncidentState } from '../src/state/types.ts';
import { blastRadius, nodeHealth, scenarioTopology } from '../src/state/topology.ts';

const topo = scenarioTopology(paymentOutage);
const node = (id: string) => topo.nodes.find((n) => n.id === id)!;

function stateAt(over: Partial<IncidentState>): IncidentState {
  return { ...initialState(paymentOutage), ...over };
}

test('a default topology is derived from the service name', () => {
  assert.equal(topo.rootId, paymentOutage.serviceName);
  assert.ok(topo.nodes.some((n) => n.kind === 'client'));
  assert.ok(topo.nodes.some((n) => n.kind === 'datastore'));
  assert.ok(topo.nodes.length >= 3);
});

test('before the incident starts, everything is healthy', () => {
  const s = stateAt({ started: false });
  for (const n of topo.nodes) assert.equal(nodeHealth(n, s, topo), 'healthy');
});

test('the failing service is down and damage spreads upstream as severity rises', () => {
  const sev1 = stateAt({ started: true, severity: 1 });
  assert.equal(nodeHealth(node(topo.rootId), sev1, topo), 'down');
  assert.equal(nodeHealth(node('edge'), sev1, topo), 'degraded');
  assert.equal(nodeHealth(node('web'), sev1, topo), 'healthy');
  // The datastore is downstream of the failure, so it stays healthy. That is the
  // teaching signal: the red flows toward the client, not toward the db.
  assert.equal(nodeHealth(node('db'), sev1, topo), 'healthy');

  const sev2 = stateAt({ started: true, severity: 2 });
  assert.equal(nodeHealth(node('edge'), sev2, topo), 'down');
  assert.equal(nodeHealth(node('web'), sev2, topo), 'degraded');
  assert.equal(nodeHealth(node('db'), sev2, topo), 'healthy');

  assert.ok(blastRadius(sev2, topo) > blastRadius(sev1, topo));
});

test('once resolved, every node returns to healthy', () => {
  const s = stateAt({ started: true, severity: 3, resolved: true });
  for (const n of topo.nodes) assert.equal(nodeHealth(n, s, topo), 'healthy');
  assert.equal(blastRadius(s, topo), 0);
});

test('health is a pure function of state, so replays reproduce it', () => {
  const a = stateAt({ started: true, severity: 2, elapsed: 120 });
  const b = stateAt({ started: true, severity: 2, elapsed: 120 });
  for (const n of topo.nodes) assert.equal(nodeHealth(n, a, topo), nodeHealth(n, b, topo));
});
