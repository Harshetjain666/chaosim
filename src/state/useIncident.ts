import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Scenario } from '../scenario/types.ts';
import type { Action, IncidentState } from './types.ts';
import { initialState, reducer } from './engine.ts';
import { clearGame, saveGame } from './persistence.ts';
import { buildRunRecord, saveRun } from './runs.ts';

// Re-exported so existing imports keep working; the implementations live in engine.ts.
export { applyAction, initialState, reducer } from './engine.ts';

export function useIncident(scenario: Scenario, resumeState?: IncidentState) {
  const [state, dispatch] = useReducer(
    (s: IncidentState, a: Action) => reducer(scenario, s, a),
    resumeState,
    (init) => init ?? initialState(scenario),
  );

  useEffect(() => {
    if (!state.started || state.submitted) return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [state.started, state.submitted]);

  // Autosave while the incident is live, clear it once the run is submitted.
  useEffect(() => {
    if (state.submitted) {
      clearGame();
    } else if (state.started) {
      saveGame({ v: 1, scenarioId: scenario.id, playerName: state.playerName, state });
    }
  }, [state, scenario.id]);

  // Persist the completed run (result plus the replayable action log), once.
  const savedRunRef = useRef(false);
  useEffect(() => {
    if (state.submitted && state.evaluation && !savedRunRef.current) {
      savedRunRef.current = true;
      saveRun(buildRunRecord(scenario, state, state.evaluation));
    }
  }, [state.submitted, state.evaluation, scenario, state]);

  const actions = useMemo(
    () => ({
      start: (name: string) => dispatch({ type: 'start', name }),
      openFile: (path: string) => dispatch({ type: 'openFile', path }),
      closeTab: (path: string) => dispatch({ type: 'closeTab', path }),
      setActive: (path: string) => dispatch({ type: 'setActive', path }),
      editFile: (path: string, content: string) => dispatch({ type: 'editFile', path, content }),
      ceoReply: (text: string) => dispatch({ type: 'ceoReply', text }),
      runCommand: (command: string) => dispatch({ type: 'runCommand', command }),
      openKb: () => dispatch({ type: 'openKb' }),
      dismissEvent: () => dispatch({ type: 'dismissEvent' }),
      submit: () => dispatch({ type: 'submit' }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  );

  return { state, actions };
}
