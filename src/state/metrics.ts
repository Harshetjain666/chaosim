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

/** One streamed firehose line for the given second, drawn from the scenario. */
export function nextLogLine(scenario: Scenario, elapsed: number): string {
  const ts = `[2024-01-15 ${clockHMS(elapsed)}]`;
  const alerts = scenario.liveAlerts;
  const line = alerts[elapsed % alerts.length] ?? alerts[0] ?? 'ERROR';
  return `${ts} ${line}`;
}

export function recoveryLine(scenario: Scenario, elapsed: number): string {
  return `[2024-01-15 ${clockHMS(elapsed)}] ${scenario.recoveryAlert}`;
}
