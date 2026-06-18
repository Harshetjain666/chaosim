import type { Scenario } from '../scenario/types.ts';
import { clock } from '../format.ts';

interface Props {
  scenario: Scenario;
  elapsed: number;
  onExit: () => void;
  onOpenKb: () => void;
  onSubmit: () => void;
}

export function TopBar({ scenario, elapsed, onExit, onOpenKb, onSubmit }: Props) {
  const remaining = scenario.deadlineSeconds - elapsed;
  const low = remaining <= 5 * 60;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="logo" onClick={onExit} type="button" title="Save and exit to menu">
          CHAOS SIM
        </button>
        <span className="incident-chip">
          {scenario.code} · {scenario.title.toUpperCase()}
        </span>
        <button className="kb-chip" onClick={onOpenKb} type="button">
          [ KB ]
        </button>
      </div>

      <div className="topbar-center">
        <span className="demo-label">BOARD DEMO IN</span>
        <span className={`demo-clock ${low ? 'low' : ''}`}>{clock(remaining)}</span>
      </div>

      <button className="submit-btn" onClick={onSubmit} type="button">
        SUBMIT FOR EVALUATION
      </button>
    </header>
  );
}
