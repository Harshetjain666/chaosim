import type { CeoMessage, IncidentEvent, KbArticle, Scenario, SourceFile } from '../scenario/types.ts';
import type { CompanyContext, ServiceSpec } from './context.ts';

/**
 * A generated incident: the runnable Scenario plus validation metadata. The
 * reference fix is used by the validator to certify solvability and is never
 * part of what a candidate sees.
 */
export interface GeneratedScenario {
  scenario: Scenario;
  validation: {
    bugFile: string;
    brokenContent: string;
    referenceFixContent: string;
  };
}

/** What an archetype supplies; the scaffold assembles the rest of the Scenario. */
export interface ArchetypeParts {
  serviceFiles: SourceFile[];
  bugFile: string;
  brokenContent: string;
  referenceFixContent: string;
  isFixed: (content: string) => boolean;
  testFile: string;
  testName: string;
  testContent: string;
  errorLog: string;
  failTrace: string[];
  crashLine: string;
  diff: string;
  liveAlerts: string[];
  /** Fills the briefing, e.g. "throwing 500s" or "rejecting almost every order". */
  symptom: string;
  diagnoseObjective: string;
  rootObjective: string;
}

export function stableCode(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `INC-G${(h % 9000) + 1000}`;
}

export function envFile(svc: ServiceSpec): string {
  return `DATABASE_URL=postgres://${svc.short}:${svc.short}@db:5432/${svc.short}\nPORT=${svc.port}\n`;
}

export function accessLog(method: string, path: string, code: number): string {
  return (
    `172.18.0.5 - ${method} ${path} ${code} 14ms\n` +
    `172.18.0.9 - ${method} ${path} ${code} 12ms\n` +
    `172.18.0.2 - GET  /healthz 200 1ms\n` +
    `172.18.0.5 - ${method} ${path} ${code} 13ms\n`
  );
}

export function dockerFile(svc: ServiceSpec): string {
  return (
    `services:\n  ${svc.name}:\n    build: ./${svc.name}\n    ports: ['${svc.port}:${svc.port}']\n` +
    `    env_file: ./config/env.example\n    depends_on: [db]\n  db:\n    image: postgres:16\n`
  );
}

export function readmeFile(ctx: CompanyContext, svc: ServiceSpec, method: string): string {
  return (
    `# ${svc.name}\n\nOwned by the ${svc.short} team at ${ctx.company}.\n\n` +
    `## Test\n    npm test\n\n## On call\nIf ${method} ${svc.path} starts failing, read logs/error.log, then check the\n` +
    `most recent deploy with git diff. Restart with: restart ${svc.name}\n`
  );
}

function ceoScript(ctx: CompanyContext, minutes: number): CeoMessage[] {
  return [
    { id: 'g1', atSeconds: 0, text: ctx.ceo.opener.replace('{minutes}', String(minutes)) },
    { id: 'g2', atSeconds: 75, text: ctx.ceo.nudge },
    { id: 'g3', atSeconds: 180, text: 'I need one line I can say to the room right now. What do I tell them?' },
    { id: 'g4', atSeconds: 360, text: 'Every minute this is down we are losing real money. Talk to me.' },
  ];
}

function kb(svc: ServiceSpec, method: string): KbArticle[] {
  return [
    {
      id: 'kb-runbook',
      title: `Runbook: ${svc.name} failures`,
      body:
        `When ${method} ${svc.path} starts failing:\n` +
        '1. Read logs/error.log for the reason and the file:line.\n' +
        '2. The crash site is often a symptom. Check git diff and the most recent deploy.\n' +
        '3. Reproduce with: npm test\n' +
        `4. After fixing, run npm test again, then: restart ${svc.name}`,
    },
    {
      id: 'kb-deploys',
      title: 'Recent deploys',
      body:
        `${svc.recentCommit}  recent refactor on ${svc.handlerModule}.js   (11 min ago)\n` +
        `The ${svc.recentCommit} change shipped right before the alerts started.`,
    },
    {
      id: 'kb-comms',
      title: 'Incident comms',
      body: 'Keep the CEO updated in plain language: the symptom, that you are on it, and a rough ETA. Silence reads as panic.',
    },
  ];
}

function events(ctx: CompanyContext, svc: ServiceSpec): IncidentEvent[] {
  return [
    { id: 'esc1', atSeconds: 45, kind: 'escalation', title: 'PRODUCTION FULLY DOWN', body: `Every ${svc.path} call is now failing. Customers are blocked.`, severityTo: 2 },
    { id: 'call', atSeconds: 120, kind: 'boss_call', title: `${ctx.ceo.name} is calling`, body: 'She wants a verbal update. The board is in the room.' },
    { id: 'esc2', atSeconds: 300, kind: 'escalation', title: 'THE BOARD IS WATCHING THE DASHBOARD', body: 'Your error graph is on the screen behind the CEO.', severityTo: 3 },
  ];
}

function deploys(svc: ServiceSpec): string[] {
  return [
    `${svc.recentCommit}  recent refactor on ${svc.handlerModule}.js          (11 min ago)`,
    '7d4e0b1  chore: bump pg to 8.11                              (3 hours ago)',
    'f02ca90  feat: idempotency keys                              (yesterday)',
  ];
}

/** Assemble a full Scenario from archetype-specific parts plus the shared shell. */
export function assembleScenario(ctx: CompanyContext, svc: ServiceSpec, parts: ArchetypeParts): GeneratedScenario {
  const minutes = ctx.deadlineMinutes;
  const method = svc.method.toUpperCase();
  const upper = svc.name.toUpperCase().replace(/-/g, '_');
  const title = `${svc.short.charAt(0).toUpperCase() + svc.short.slice(1)} Service Down`;
  const isLogAccessCode = parts.symptom.includes('reject') ? 422 : 500;

  const files: SourceFile[] = [
    ...parts.serviceFiles,
    { path: 'src/config/env.example', name: 'env.example', group: 'config', language: 'env', content: envFile(svc) },
    { path: parts.testFile, name: parts.testFile.split('/').pop() ?? 'test.js', group: 'tests', language: 'js', content: parts.testContent },
    { path: 'src/logs/error.log', name: 'error.log', group: 'logs', language: 'log', content: parts.errorLog },
    { path: 'src/logs/access.log', name: 'access.log', group: 'logs', language: 'log', content: accessLog(method, svc.path, isLogAccessCode) },
    { path: 'docker-compose.yml', name: 'docker-compose.yml', group: 'root', language: 'yaml', content: dockerFile(svc) },
    { path: 'README.md', name: 'README.md', group: 'root', language: 'md', content: readmeFile(ctx, svc, method) },
  ];

  const scenario: Scenario = {
    id: `gen-${ctx.company.toLowerCase()}-${svc.name}`,
    code: stableCode(ctx.company + svc.name),
    title,
    serviceName: svc.name,
    ceoName: ctx.ceo.name,
    ceoRole: ctx.ceo.role,
    deadlineSeconds: minutes * 60,
    briefing:
      `You are a senior engineer at ${ctx.company}. The board demo is in ${minutes} minutes. The ${svc.name} is ${parts.symptom}. ` +
      'Your behavior, decisions, and speed are all being evaluated.',
    files,
    ceoScript: ceoScript(ctx, minutes),
    kb: kb(svc, method),
    objectives: [
      { id: 'diagnose', label: parts.diagnoseObjective, done: (s) => s.tFirstDiagnose !== null },
      { id: 'root', label: parts.rootObjective, done: (s) => s.tFirstCodeOpen !== null },
      { id: 'patch', label: 'Find and fix the root cause', done: (s) => parts.isFixed(s.fileContents[parts.bugFile] ?? '') },
      { id: 'verify', label: 'Verify the fix with npm test', done: (s) => s.testsPassed },
      { id: 'restore', label: 'Restart the service and clear the incident', done: (s) => s.resolved },
      { id: 'comms', label: 'Keep the CEO updated', done: (s) => s.ceoReplyTimes.length >= 1 },
    ],
    events: events(ctx, svc),
    bugFile: parts.bugFile,
    isFixed: parts.isFixed,
    testFile: parts.testFile,
    testName: parts.testName,
    failTrace: parts.failTrace,
    crashLine: parts.crashLine,
    deploys: deploys(svc),
    diff: parts.diff,
    liveAlerts: parts.liveAlerts,
    recoveryAlert: `INFO: ${svc.name} healthy. error rate 0%. ${upper}_DOWN cleared.`,
    generated: true,
    generatedFor: ctx.company,
  };

  return { scenario, validation: { bugFile: parts.bugFile, brokenContent: parts.brokenContent, referenceFixContent: parts.referenceFixContent } };
}
