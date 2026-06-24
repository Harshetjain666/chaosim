import type { Scenario, Topology, TopologyNode } from '../scenario/types.ts';
import type { IncidentState } from './types.ts';

export type Health = 'healthy' | 'degraded' | 'down';

/**
 * The service graph for the map. Hand-authored scenarios may carry their own;
 * otherwise we derive a realistic default chain from the service name:
 *   web-client -> checkout-edge -> {the failing service} -> its datastore
 * which lines up with the alerts ("502 Bad Gateway from checkout-edge").
 */
export function scenarioTopology(scenario: Scenario): Topology {
  if (scenario.topology) return scenario.topology;
  const root = scenario.serviceName;
  const short = root.replace(/-service$/, '');
  return {
    nodes: [
      { id: 'web', label: 'web-client', kind: 'client' },
      { id: 'edge', label: 'checkout-edge', kind: 'edge' },
      { id: root, label: root, kind: 'service' },
      { id: 'db', label: `${short}-db`, kind: 'datastore' },
    ],
    edges: [
      { from: 'web', to: 'edge' },
      { from: 'edge', to: root },
      { from: root, to: 'db' },
    ],
    rootId: root,
  };
}

/** Hops from `id` to the root following edges forward (a caller chain). Infinity if it never reaches root. */
function callerDistance(id: string, topo: Topology): number {
  if (id === topo.rootId) return 0;
  const out = new Map<string, string[]>();
  for (const e of topo.edges) {
    const list = out.get(e.from) ?? [];
    list.push(e.to);
    out.set(e.from, list);
  }
  const seen = new Set<string>([id]);
  let frontier = [id];
  let dist = 0;
  while (frontier.length) {
    dist += 1;
    const next: string[] = [];
    for (const n of frontier) {
      for (const to of out.get(n) ?? []) {
        if (to === topo.rootId) return dist;
        if (!seen.has(to)) {
          seen.add(to);
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Live health of one node, derived purely from incident state so a replay
 * reproduces the exact propagation. The failing service is down; its callers
 * take collateral damage that spreads outward as severity escalates; anything
 * downstream of the failure (the datastore) stays healthy, which is the whole
 * point: the red flows toward the client, telling the candidate where to look.
 */
export function nodeHealth(node: TopologyNode, state: IncidentState, topo: Topology): Health {
  if (!state.started || state.resolved) return 'healthy';
  if (node.id === topo.rootId) return 'down';
  const d = callerDistance(node.id, topo);
  if (!Number.isFinite(d)) return 'healthy';
  const sev = state.severity;
  if (sev >= d + 1) return 'down';
  if (sev >= d) return 'degraded';
  return 'healthy';
}

export interface PlacedNode extends TopologyNode {
  layer: number;
  row: number;
  rows: number;
}

/** Left to right layered layout: a node sits one column right of its callers. */
export function layoutTopology(topo: Topology): { placed: PlacedNode[]; layers: number } {
  const incoming = new Map<string, number>();
  for (const n of topo.nodes) incoming.set(n.id, 0);
  for (const e of topo.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);

  const layer = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const e of topo.edges) {
    const l = out.get(e.from) ?? [];
    l.push(e.to);
    out.set(e.from, l);
  }
  let frontier = topo.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of frontier) layer.set(id, 0);
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      const here = layer.get(id) ?? 0;
      for (const to of out.get(id) ?? []) {
        const proposed = here + 1;
        if (proposed > (layer.get(to) ?? -1)) {
          layer.set(to, proposed);
          next.push(to);
        }
      }
    }
    frontier = next;
  }

  const byLayer = new Map<number, string[]>();
  for (const n of topo.nodes) {
    const l = layer.get(n.id) ?? 0;
    const list = byLayer.get(l) ?? [];
    list.push(n.id);
    byLayer.set(l, list);
  }
  const placed: PlacedNode[] = topo.nodes.map((n) => {
    const l = layer.get(n.id) ?? 0;
    const peers = byLayer.get(l) ?? [n.id];
    return { ...n, layer: l, row: peers.indexOf(n.id), rows: peers.length };
  });
  const layers = Math.max(0, ...placed.map((p) => p.layer)) + 1;
  return { placed, layers };
}

/** How many services are currently degraded or down, for the blast-radius readout. */
export function blastRadius(state: IncidentState, topo: Topology): number {
  return topo.nodes.filter((n) => nodeHealth(n, state, topo) !== 'healthy').length;
}
