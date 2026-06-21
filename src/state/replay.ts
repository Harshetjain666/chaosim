import { applyAction, initialState } from './engine.ts';
import type { Scenario } from '../scenario/types.ts';
import type { IncidentState, RecordedAction } from './types.ts';

/**
 * Deterministic replay.
 *
 * Because the reducer is a pure function of (state, action) with no clock or
 * randomness, replaying the recorded action log reconstructs the exact world
 * the candidate saw at any second. To reach second T we start fresh, apply the
 * actions at second 0, then for each tick advance the clock and apply that
 * second's actions in their recorded order. Same log, same run, every time.
 */
export function reconstructAt(scenario: Scenario, actionLog: RecordedAction[], targetElapsed: number): IncidentState {
  let state = initialState(scenario);
  for (const r of actionLog) {
    if (r.atElapsed === 0) state = applyAction(scenario, state, r.action);
  }
  for (let e = 1; e <= targetElapsed; e += 1) {
    state = applyAction(scenario, state, { type: 'tick' });
    for (const r of actionLog) {
      if (r.atElapsed === e) state = applyAction(scenario, state, r.action);
    }
  }
  return state;
}

/** A human-readable line describing one recorded action, for the replay log. */
export function describeAction(r: RecordedAction): string {
  const a = r.action;
  switch (a.type) {
    case 'start':
      return `entered the incident as ${a.name || 'Engineer'}`;
    case 'openFile':
      return `opened ${a.path.split('/').pop()}`;
    case 'setActive':
      return `switched to ${a.path.split('/').pop()}`;
    case 'closeTab':
      return `closed ${a.path.split('/').pop()}`;
    case 'editFile':
      return `edited ${a.path.split('/').pop()}`;
    case 'ceoReply':
      return `replied to the CEO: "${a.text}"`;
    case 'runCommand':
      return `ran \`${a.command}\``;
    case 'openKb':
      return 'opened the knowledge base';
    case 'dismissEvent':
      return 'acknowledged an incident event';
    default:
      return a.type;
  }
}
