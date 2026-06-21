import type { Scenario } from '../scenario/types.ts';
import type { Evaluation, IncidentState, RecordedAction } from './types.ts';

const KEY = 'chaosim.runs.v1';

/**
 * A completed run. Holds the scored result plus the full ordered action log,
 * which is all that is needed to deterministically replay exactly what the
 * candidate did. This is the unit a backend will persist later.
 */
export interface RunRecord {
  id: string;
  scenarioId: string;
  scenarioCode: string;
  scenarioTitle: string;
  playerName: string;
  grade: string;
  score: number;
  percentile: number;
  resolved: boolean;
  durationElapsed: number;
  actionLog: RecordedAction[];
  evaluation: Evaluation;
  completedAt: string;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function listRuns(): RunRecord[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RunRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(record: RunRecord): void {
  const s = storage();
  if (!s) return;
  try {
    const runs = listRuns();
    runs.unshift(record);
    s.setItem(KEY, JSON.stringify(runs.slice(0, 50)));
  } catch {
    // best effort
  }
}

export function getRun(id: string): RunRecord | null {
  return listRuns().find((r) => r.id === id) ?? null;
}

export function clearRuns(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    // ignore
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `run-${Date.now().toString(36)}`;
}

export function buildRunRecord(scenario: Scenario, state: IncidentState, evaluation: Evaluation): RunRecord {
  return {
    id: newId(),
    scenarioId: scenario.id,
    scenarioCode: scenario.code,
    scenarioTitle: scenario.title,
    playerName: state.playerName,
    grade: evaluation.grade,
    score: evaluation.score,
    percentile: evaluation.percentile,
    resolved: state.resolved,
    durationElapsed: state.elapsed,
    actionLog: state.actionLog,
    evaluation,
    completedAt: new Date().toISOString(),
  };
}
