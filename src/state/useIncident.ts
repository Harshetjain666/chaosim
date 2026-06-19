import { useEffect, useMemo, useReducer } from 'react';
import type { IncidentEvent, Scenario } from '../scenario/types.ts';
import type { ChatMessage, IncidentState, TerminalLine } from './types.ts';
import { runCommand } from './terminal.ts';
import { evaluate } from './evaluation.ts';
import { nextLogLine, recoveryLine } from './metrics.ts';
import { clearGame, saveGame } from './persistence.ts';

const FAIL_PER_SEC = 0.78; // ~47 failed requests per minute, matching the alert
const CENTS_PER_FAIL = 4200; // a failed $42 order

// The CEO reacts so the chat reads as a conversation, not a one-way feed.
const CEO_ACKS = [
  'Ok. Keep me posted, second by second.',
  'Good. How long until we are back?',
  'Understood. I need this fixed before they sit down.',
  'Still with you. The room is getting restless.',
  'Noted. Tell me the moment it is green.',
  'Thank you. Stay on it.',
];
const CEO_RELIEF = 'Confirmed on my end, checkout is back. Strong work under pressure. Thank you.';

type Action =
  | { type: 'start'; name: string }
  | { type: 'tick' }
  | { type: 'openFile'; path: string }
  | { type: 'closeTab'; path: string }
  | { type: 'setActive'; path: string }
  | { type: 'editFile'; path: string; content: string }
  | { type: 'ceoReply'; text: string }
  | { type: 'runCommand'; command: string }
  | { type: 'openKb' }
  | { type: 'dismissEvent' }
  | { type: 'submit' }
  | { type: 'reset' };

function enqueueEvent(state: IncidentState, event: IncidentEvent): void {
  if (state.activeEvent === null) state.activeEvent = event;
  else state.eventQueue = [...state.eventQueue, event];
}

function isCodeFile(scenario: Scenario, path: string): boolean {
  return scenario.files.find((f) => f.path === path)?.language === 'js';
}

function initialState(scenario: Scenario): IncidentState {
  const fileContents: Record<string, string> = {};
  for (const f of scenario.files) fileContents[f.path] = f.content;
  return {
    started: false,
    playerName: '',
    elapsed: 0,
    stageIndex: 0,
    fileContents,
    openTabs: [],
    activeTab: null,
    chat: [],
    ceoSentIds: [],
    terminal: [{ kind: 'sys', text: 'Chaos Sim terminal ready. Type `help` for available commands.' }],
    testsRun: false,
    testsPassed: false,
    restarted: false,
    resolved: false,
    failedRequests: 0,
    revenueLostCents: 0,
    logFeed: [],
    severity: 1,
    activeEvent: null,
    eventQueue: [],
    firedEventIds: [],
    submitted: false,
    evaluation: null,
    tFirstDiagnose: null,
    tFirstCodeOpen: null,
    tFirstTest: null,
    tFirstAction: null,
    tResolve: null,
    ceoReplyTimes: [],
    commandCount: 0,
    fileOpenCount: 0,
    editCount: 0,
    openedKb: false,
    openedBugFile: false,
    testsBeforeFix: 0,
    failedCommandCount: 0,
    repliedUnderPressure: false,
  };
}

function fireCeo(state: IncidentState, scenario: Scenario): IncidentState {
  const due = scenario.ceoScript.filter((m) => m.atSeconds <= state.elapsed && !state.ceoSentIds.includes(m.id));
  if (due.length === 0) return state;
  const msgs: ChatMessage[] = due.map((m) => ({ id: m.id, from: 'ceo', text: m.text, atElapsed: state.elapsed }));
  return { ...state, chat: [...state.chat, ...msgs], ceoSentIds: [...state.ceoSentIds, ...due.map((m) => m.id)] };
}

function recomputeStage(state: IncidentState): number {
  let idx = 0;
  if (state.tFirstDiagnose !== null) idx = 1;
  if (state.tFirstCodeOpen !== null) idx = Math.max(idx, 2);
  if (state.testsRun) idx = Math.max(idx, 3);
  if (state.resolved) idx = 4;
  return Math.max(state.stageIndex, idx);
}

function reducer(scenario: Scenario, state: IncidentState, action: Action): IncidentState {
  switch (action.type) {
    case 'start': {
      const next = { ...state, started: true, playerName: action.name.trim() || 'Engineer' };
      return fireCeo(next, scenario);
    }

    case 'tick': {
      if (!state.started || state.submitted) return state;
      const elapsed = state.elapsed + 1;
      let next: IncidentState = { ...state, elapsed };
      if (!next.resolved) {
        next.failedRequests = state.failedRequests + FAIL_PER_SEC * next.severity;
        next.revenueLostCents = state.revenueLostCents + FAIL_PER_SEC * CENTS_PER_FAIL * next.severity;
        if (elapsed % 2 === 0) {
          next.logFeed = [...state.logFeed, nextLogLine(scenario, elapsed)].slice(-40);
        }
        const due = scenario.events.filter((e) => e.atSeconds <= elapsed && !next.firedEventIds.includes(e.id));
        if (due.length > 0) {
          next.firedEventIds = [...next.firedEventIds, ...due.map((e) => e.id)];
          for (const e of due) {
            if (e.kind === 'escalation' && e.severityTo) next.severity = Math.max(next.severity, e.severityTo);
            enqueueEvent(next, e);
          }
        }
      }
      return fireCeo(next, scenario);
    }

    case 'openFile': {
      const openTabs = state.openTabs.includes(action.path) ? state.openTabs : [...state.openTabs, action.path];
      let next: IncidentState = {
        ...state,
        openTabs,
        activeTab: action.path,
        fileOpenCount: state.fileOpenCount + 1,
      };
      if (next.tFirstAction === null) next.tFirstAction = next.elapsed;
      if (action.path.endsWith('error.log') && next.tFirstDiagnose === null) next.tFirstDiagnose = next.elapsed;
      if (isCodeFile(scenario, action.path) && next.tFirstCodeOpen === null) next.tFirstCodeOpen = next.elapsed;
      if (action.path === scenario.bugFile) next.openedBugFile = true;
      next = { ...next, stageIndex: recomputeStage(next) };
      return next;
    }

    case 'closeTab': {
      const openTabs = state.openTabs.filter((p) => p !== action.path);
      const activeTab = state.activeTab === action.path ? (openTabs[openTabs.length - 1] ?? null) : state.activeTab;
      return { ...state, openTabs, activeTab };
    }

    case 'setActive':
      return { ...state, activeTab: action.path };

    case 'editFile': {
      const fileContents = { ...state.fileContents, [action.path]: action.content };
      let next: IncidentState = { ...state, fileContents, editCount: state.editCount + 1 };
      if (isCodeFile(scenario, action.path)) {
        if (next.tFirstCodeOpen === null) next.tFirstCodeOpen = next.elapsed;
        // Changing the code invalidates a prior test pass and restart: you have
        // to verify and restart again before it counts as resolved.
        if (action.path === scenario.bugFile) {
          next.testsPassed = false;
          next.restarted = false;
        }
      }
      next = { ...next, stageIndex: recomputeStage(next) };
      return next;
    }

    case 'ceoReply': {
      const text = action.text.trim();
      if (text === '') return state;
      const msg: ChatMessage = { id: `you-${state.elapsed}-${state.chat.length}`, from: 'you', text, atElapsed: state.elapsed };
      const nextChat = [...state.chat, msg];
      // She answers back so replying feels heard, but a busy CEO does not reply
      // to every single line: the first few, then occasionally.
      const n = state.ceoReplyTimes.length;
      if (!state.resolved && (n < 3 || n % 3 === 0)) {
        const ack = CEO_ACKS[n % CEO_ACKS.length] ?? CEO_ACKS[0]!;
        nextChat.push({ id: `ceo-ack-${state.elapsed}-${state.chat.length}`, from: 'ceo', text: ack, atElapsed: state.elapsed });
      }
      const underPressure = state.repliedUnderPressure || state.firedEventIds.length > 0;
      return {
        ...state,
        chat: nextChat,
        ceoReplyTimes: [...state.ceoReplyTimes, state.elapsed],
        repliedUnderPressure: underPressure,
      };
    }

    case 'runCommand': {
      const result = runCommand(action.command, scenario, state);
      const inLine: TerminalLine = { kind: 'in', text: action.command };
      const terminal: TerminalLine[] = result.flags.clear
        ? []
        : [...state.terminal, inLine, ...result.out.map((t) => ({ kind: 'out' as const, text: t }))].slice(-300);

      let next: IncidentState = { ...state, terminal, commandCount: state.commandCount + 1 };

      if (next.tFirstAction === null) next.tFirstAction = next.elapsed;
      if (result.out[0]?.startsWith('command not found')) next.failedCommandCount += 1;
      if (result.flags.diagnosed && next.tFirstDiagnose === null) next.tFirstDiagnose = next.elapsed;
      if (result.flags.ranTests) {
        if (result.flags.testsPassed === false) next.testsBeforeFix += 1;
        next.testsRun = true;
        if (next.tFirstTest === null) next.tFirstTest = next.elapsed;
        next.testsPassed = result.flags.testsPassed === true;
      }
      if (result.flags.restarted) next.restarted = true;

      const fixed = scenario.isFixed(next.fileContents[scenario.bugFile] ?? '');
      if (fixed && next.testsPassed && next.restarted && !next.resolved) {
        next.resolved = true;
        next.tResolve = next.elapsed;
        next.logFeed = [...next.logFeed, recoveryLine(scenario, next.elapsed)].slice(-40);
        next.chat = [...next.chat, { id: `ceo-relief-${next.elapsed}`, from: 'ceo', text: CEO_RELIEF, atElapsed: next.elapsed }];
        next.eventQueue = [];
        next.activeEvent = {
          id: 'resolved',
          atSeconds: next.elapsed,
          kind: 'system',
          title: 'INCIDENT MITIGATED',
          body: `${scenario.serviceName} is healthy. Error rate is back to 0%. Submit for evaluation when you are ready.`,
        };
      }
      next = { ...next, stageIndex: recomputeStage(next) };
      return next;
    }

    case 'openKb':
      return { ...state, openedKb: true };

    case 'dismissEvent': {
      const [head, ...rest] = state.eventQueue;
      return { ...state, activeEvent: head ?? null, eventQueue: rest };
    }

    case 'submit':
      return { ...state, submitted: true, evaluation: evaluate(state, scenario) };

    case 'reset':
      return initialState(scenario);

    default:
      return state;
  }
}

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
