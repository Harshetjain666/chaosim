import type { IncidentState } from '../state/types.ts';

/**
 * Scenario model for ChaoSim.
 *
 * An incident is pure data: the broken codebase, the logs, the CEO who is
 * messaging, the knowledge base, the objectives, and the rule for what counts
 * as a real fix. The engine, the IDE shell, the terminal, the metrics, and the
 * evaluation are all scenario agnostic, so a second incident is a second data
 * file and nothing else.
 */

export type Language = 'js' | 'yaml' | 'env' | 'md' | 'log';

export interface SourceFile {
  path: string;
  name: string;
  group: string;
  language: Language;
  content: string;
  editable?: boolean;
}

export interface CeoMessage {
  id: string;
  text: string;
  atSeconds: number;
}

export interface KbArticle {
  id: string;
  title: string;
  body: string;
}

/** A dramatic, timed incident beat. The clip-worthy moments from the GDD. */
export interface IncidentEvent {
  id: string;
  atSeconds: number;
  kind: 'escalation' | 'boss_call' | 'system';
  title: string;
  body: string;
  /** Escalations raise the live severity, making the metrics visibly worsen. */
  severityTo?: number;
}

export interface Objective {
  id: string;
  label: string;
  done: (s: IncidentState) => boolean;
}

export type Stage = 'alerted' | 'diagnosing' | 'fixing' | 'testing' | 'resolved';

export const STAGES: Stage[] = ['alerted', 'diagnosing', 'fixing', 'testing', 'resolved'];

/** A node in the live service map. Edges point from a caller to its dependency. */
export type NodeKind = 'client' | 'edge' | 'service' | 'datastore' | 'external';

export interface TopologyNode {
  id: string;
  label: string;
  kind: NodeKind;
}

export interface TopologyEdge {
  from: string;
  to: string;
}

/**
 * The service graph behind the incident. The failing service is `rootId`; the
 * map derives, in real time, which upstream callers are taking collateral damage
 * so the candidate can see the blast radius instead of inferring it from logs.
 * Optional: when absent, a sensible default is derived from the service name.
 */
export interface Topology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  rootId: string;
}

export interface Scenario {
  id: string;
  code: string;
  title: string;
  serviceName: string;
  ceoName: string;
  ceoRole: string;
  deadlineSeconds: number;
  briefing: string;

  files: SourceFile[];
  ceoScript: CeoMessage[];
  kb: KbArticle[];
  objectives: Objective[];
  events: IncidentEvent[];

  /** The file that holds the root cause, and the rule that proves it is fixed. */
  bugFile: string;
  isFixed: (content: string) => boolean;

  // terminal surface, kept out of the interpreter so it stays scenario agnostic
  testFile: string;
  testName: string;
  /** Printed when `npm test` fails on the broken code. */
  failTrace: string[];
  /** Symptom printed if the service is restarted while still broken. */
  crashLine: string;
  /** `git log` output. */
  deploys: string[];
  /** `git diff` / `git show` output: the bad change that caused the incident. */
  diff: string;

  // live observability
  liveAlerts: string[];
  recoveryAlert: string;

  /** True when produced by the Company Brain generator rather than hand-authored. */
  generated?: boolean;
  /** The company this incident was generated for, for the picker label. */
  generatedFor?: string;

  /** The service graph for the live system map. Derived from serviceName if omitted. */
  topology?: Topology;
}
