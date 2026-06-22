import type { Scenario } from '../scenario/types.ts';

interface Props {
  scenario: Scenario;
  onBegin: () => void;
}

/**
 * A short orientation shown the moment the candidate enters, before the clock
 * starts. It tells them what the workspace is and where to begin, so the first
 * seconds go to the incident and not to learning the UI. The countdown does not
 * start until they press enter.
 */
export function EntryPrimer({ scenario, onBegin }: Props) {
  return (
    <div className="primer-overlay">
      <div className="primer-card">
        <span className="primer-tag">● INCIDENT BRIEF</span>
        <h2 className="primer-title">
          {scenario.code} · {scenario.title}
        </h2>
        <p className="primer-brief">{scenario.briefing}</p>

        <div className="primer-rows">
          <div className="primer-row">
            <span className="primer-key">Workspace</span>
            <span>A shell, the source files, the live logs, and a CEO who will not stop messaging.</span>
          </div>
          <div className="primer-row">
            <span className="primer-key">Your job</span>
            <span>Find it. Fix it. Prove it with a test, then restart the service.</span>
          </div>
          <div className="primer-row">
            <span className="primer-key">Start at</span>
            <span>
              <code>logs/error.log</code>. Everything you open and run is being scored.
            </span>
          </div>
        </div>

        <button className="enter-btn" onClick={onBegin} type="button" autoFocus>
          ENTER THE INCIDENT · START THE CLOCK →
        </button>
      </div>
    </div>
  );
}
