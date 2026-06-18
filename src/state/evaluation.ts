import type { Scenario } from '../scenario/types.ts';
import type { Evaluation, EvaluationCategory, IncidentState } from './types.ts';

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 68) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score the incident response across five behavioral dimensions.
 *
 * ChaoSim is an assessment, so the report is the product. It does not grade
 * whether one line changed; it grades how the engineer worked: did they resolve
 * it and how fast, did they diagnose before acting, did they verify with tests,
 * did they communicate under pressure, and did they work cleanly.
 */
export function evaluate(state: IncidentState, scenario: Scenario): Evaluation {
  const resolved = state.resolved;
  const timeUsed = state.tResolve ?? state.elapsed;
  const deadline = scenario.deadlineSeconds;

  const categories: EvaluationCategory[] = [];

  // 1. Resolution: did the outage end, and how fast.
  {
    const notes: string[] = [];
    let score: number;
    if (resolved) {
      const margin = Math.max(0, deadline - timeUsed) / deadline;
      score = clamp(70 + margin * 30);
      notes.push(`Resolved in ${fmt(timeUsed)}, with ${Math.round(margin * 100)}% of the window to spare.`);
    } else {
      score = clamp((state.stageIndex / 4) * 45);
      notes.push('The service was never restored to healthy.');
    }
    categories.push({ key: 'resolution', label: 'Resolution & speed', weight: 0.3, score, notes });
  }

  // 2. Diagnosis: read the logs first, found the root cause, used the docs.
  {
    const notes: string[] = [];
    let score = 0;
    const readLogsFirst =
      state.tFirstDiagnose !== null &&
      (state.tFirstCodeOpen === null || state.tFirstDiagnose <= state.tFirstCodeOpen);
    if (readLogsFirst) {
      score += 50;
      notes.push('Read the logs before touching code.');
    } else if (state.tFirstDiagnose === null) {
      notes.push('Never opened the error log; the stack trace named the file and line.');
    } else {
      score += 18;
      notes.push('Edited code before reading the logs.');
    }
    if (state.openedBugFile) {
      score += 35;
      notes.push('Opened the actual root-cause file.');
    } else {
      notes.push('Did not open the file that held the bug.');
    }
    if (state.openedKb) {
      score += 15;
      notes.push('Checked the knowledge base.');
    }
    categories.push({ key: 'diagnosis', label: 'Diagnosis', weight: 0.22, score: clamp(score), notes });
  }

  // 3. Verification: reproduced the failure, confirmed the fix, shipped in order.
  {
    const notes: string[] = [];
    let score = 0;
    if (state.testsBeforeFix >= 1) {
      score += 35;
      notes.push('Reproduced the failure with the tests before changing code.');
    } else {
      notes.push('Did not reproduce the failure with a test first.');
    }
    if (state.testsPassed) {
      score += 45;
      notes.push('Confirmed the fix with a passing test run.');
    } else if (resolved) {
      notes.push('Called it resolved without a green test run.');
    }
    if (state.restarted && state.testsPassed) {
      score += 20;
      notes.push('Restarted only after the tests were green.');
    }
    categories.push({ key: 'verification', label: 'Verification', weight: 0.2, score: clamp(score), notes });
  }

  // 4. Communication: kept the CEO informed, fast, and under pressure.
  {
    const notes: string[] = [];
    let score = 0;
    const replies = state.ceoReplyTimes.length;
    if (replies >= 1) {
      score += 40;
      const first = state.ceoReplyTimes[0] ?? 9999;
      if (first <= 60) {
        score += 25;
        notes.push(`First update to the CEO at ${fmt(first)}.`);
      } else {
        score += 10;
        notes.push(`First update to the CEO was late, at ${fmt(first)}.`);
      }
      if (replies >= 2) {
        score += 20;
        notes.push(`Sent ${replies} updates through the incident.`);
      }
      if (state.repliedUnderPressure) {
        score += 15;
        notes.push('Kept communicating after the incident escalated.');
      }
    } else {
      notes.push('Went silent on the CEO during a live, business-critical outage.');
    }
    categories.push({ key: 'communication', label: 'Communication', weight: 0.18, score: clamp(score), notes });
  }

  // 5. Discipline: clean, efficient work, not flailing.
  {
    const notes: string[] = [];
    let score = 100;
    if (state.failedCommandCount > 0) {
      score -= Math.min(30, state.failedCommandCount * 8);
      notes.push(`${state.failedCommandCount} command(s) were typos or unknown.`);
    }
    if (state.editCount > 6) {
      score -= Math.min(30, (state.editCount - 6) * 5);
      notes.push('A lot of editing churn before the fix landed.');
    }
    if (state.failedCommandCount === 0 && state.editCount <= 6) {
      notes.push('Worked cleanly, with little wasted motion.');
    }
    categories.push({ key: 'discipline', label: 'Discipline', weight: 0.1, score: clamp(score), notes });
  }

  const overall = clamp(categories.reduce((sum, c) => sum + c.score * c.weight, 0));

  const strengths = categories.filter((c) => c.score >= 78).map((c) => `${c.label}: ${c.notes[0]}`);
  const flags = categories.filter((c) => c.score < 50).map((c) => `${c.label}: ${c.notes[0]}`);

  const verdict = resolved
    ? overall >= 80
      ? 'Calm, methodical, and communicative under fire. The kind of engineer you want on call.'
      : 'Got the service back, but the process had gaps worth tightening before the next one.'
    : 'Did not stabilize the service in time. Process matters, but the outage still has to end.';

  return {
    score: overall,
    grade: gradeFor(overall),
    resolved,
    timeLabel: fmt(timeUsed),
    categories,
    strengths,
    flags,
    verdict,
  };
}
