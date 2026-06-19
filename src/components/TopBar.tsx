import { useEffect, useState } from 'react';
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
  const [confirming, setConfirming] = useState(false);

  // Submitting ends the run, so it takes two clicks. Reset if they hesitate.
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(id);
  }, [confirming]);

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

      <button
        className={`submit-btn ${confirming ? 'confirming' : ''}`}
        onClick={() => {
          if (confirming) onSubmit();
          else setConfirming(true);
        }}
        type="button"
      >
        {confirming ? 'CONFIRM: END INCIDENT' : 'SUBMIT FOR EVALUATION'}
      </button>
    </header>
  );
}
