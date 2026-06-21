import type { IncidentEvent } from '../scenario/types.ts';

/** Every player intent the reducer understands. Recorded for deterministic replay. */
export type Action =
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

/** One recorded player action and the simulation second it happened at. */
export interface RecordedAction {
  atElapsed: number;
  action: Action;
}

export interface TerminalLine {
  kind: 'in' | 'out' | 'err' | 'sys';
  text: string;
}

export interface ChatMessage {
  id: string;
  from: 'ceo' | 'you';
  text: string;
  atElapsed: number;
}

export interface EvaluationCategory {
  key: string;
  label: string;
  weight: number;
  score: number;
  /** Benchmark band for this dimension, e.g. "top 25%". */
  band: string;
  notes: string[];
}

export interface Evaluation {
  score: number;
  grade: string;
  /** Overall benchmark percentile on this incident, 1 to 99. */
  percentile: number;
  resolved: boolean;
  timeLabel: string;
  categories: EvaluationCategory[];
  verdict: string;
}

export interface IncidentState {
  started: boolean;
  playerName: string;
  elapsed: number;
  stageIndex: number;

  fileContents: Record<string, string>;
  openTabs: string[];
  activeTab: string | null;

  chat: ChatMessage[];
  ceoSentIds: string[];

  terminal: TerminalLine[];

  testsRun: boolean;
  testsPassed: boolean;
  restarted: boolean;
  resolved: boolean;

  // live observability, accumulated while the service is down
  failedRequests: number;
  revenueLostCents: number;
  logFeed: string[];

  // dramatic incident beats
  severity: number;
  activeEvent: IncidentEvent | null;
  eventQueue: IncidentEvent[];
  firedEventIds: string[];

  /** Ordered log of player actions, enabling deterministic replay. */
  actionLog: RecordedAction[];

  submitted: boolean;
  evaluation: Evaluation | null;

  // behavior tracking, consumed by the evaluation
  tFirstDiagnose: number | null;
  tFirstCodeOpen: number | null;
  tFirstTest: number | null;
  tFirstAction: number | null;
  tResolve: number | null;
  ceoReplyTimes: number[];
  commandCount: number;
  fileOpenCount: number;
  editCount: number;
  openedKb: boolean;
  openedBugFile: boolean;
  testsBeforeFix: number;
  failedCommandCount: number;
  repliedUnderPressure: boolean;
}
