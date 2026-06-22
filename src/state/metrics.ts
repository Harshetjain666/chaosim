import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from './types.ts';

/** The incident's wall clock starts at the moment of the first alert. */
const BASE_SECONDS = 14 * 3600 + 31 * 60 + 30; // 14:31:30

export function clockHMS(elapsed: number): string {
  const t = BASE_SECONDS + Math.max(0, elapsed);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600) % 24)}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}

/** Cheap deterministic flicker so the live numbers move without true randomness. */
function jitter(seed: number, mod: number): number {
  const x = (seed * 1103515245 + 12345) >>> 0;
  return x % mod;
}

export interface DerivedMetrics {
  down: boolean;
  statusLabel: string;
  errorRatePct: number;
  latencyMs: number;
}

export function deriveMetrics(state: IncidentState): DerivedMetrics {
  if (state.resolved) {
    return { down: false, statusLabel: 'HEALTHY', errorRatePct: 0, latencyMs: 116 + jitter(state.elapsed, 16) };
  }
  const escalated = state.severity >= 2;
  return {
    down: true,
    statusLabel: 'DOWN',
    errorRatePct: escalated ? 100 : 96 + jitter(state.elapsed, 5),
    latencyMs: 3800 + (state.severity - 1) * 1200 + jitter(state.elapsed, 900),
  };
}

// Ambient operational noise mixed into the firehose so it does not read as a
// short loop. Placeholders are filled with deterministic values, so a replay
// of the same second always reproduces the same line.
const AMBIENT: string[] = [
  'WARN: checkout conversion down {pct}% over the last 60s',
  'WARN: support queue +{n} tickets tagged "payment failed"',
  'WARN: {region} edge reporting elevated 5xx',
  'ERROR: retry budget exhausted for {n} upstream calls',
  'WARN: circuit breaker half-open, {n} probes failing',
  'INFO: on-call paged, incident bridge open',
  'WARN: p99 latency {lat}s, clients timing out',
];

const REGIONS = ['us-east-1', 'eu-west-1', 'us-west-2', 'ap-south-1'];

function fillAmbient(template: string, elapsed: number): string {
  return template
    .replace('{pct}', String(8 + jitter(elapsed, 34)))
    .replace('{n}', String(11 + jitter(elapsed * 7 + 3, 60)))
    .replace('{region}', REGIONS[jitter(elapsed, REGIONS.length)] ?? REGIONS[0]!)
    .replace('{lat}', (4 + jitter(elapsed * 3 + 1, 55) / 10).toFixed(1));
}

/**
 * One streamed firehose line for the given second. Deterministically interleaves
 * the scenario's own alerts with ambient operational noise (drawn by a hash of
 * the second, not a strict cycle) so the feed feels live rather than looped.
 * Pure in (scenario, elapsed): a replay reproduces it exactly.
 */
export function nextLogLine(scenario: Scenario, elapsed: number): string {
  const ts = `[2024-01-15 ${clockHMS(elapsed)}]`;
  const alerts = scenario.liveAlerts;
  const pool = alerts.length + AMBIENT.length;
  const pick = jitter(elapsed, pool);
  if (pick < alerts.length) {
    return `${ts} ${alerts[pick] ?? alerts[0] ?? 'ERROR'}`;
  }
  return `${ts} ${fillAmbient(AMBIENT[pick - alerts.length] ?? AMBIENT[0]!, elapsed)}`;
}

export function recoveryLine(scenario: Scenario, elapsed: number): string {
  return `[2024-01-15 ${clockHMS(elapsed)}] ${scenario.recoveryAlert}`;
}
