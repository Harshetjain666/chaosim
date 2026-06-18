import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from '../state/types.ts';

interface Props {
  scenario: Scenario;
  state: IncidentState;
}

export function MissionPanel({ scenario, state }: Props) {
  const results = scenario.objectives.map((o) => ({ o, done: o.done(state) }));
  const doneCount = results.filter((r) => r.done).length;

  return (
    <div className="missions">
      <div className="missions-head">
        <span>OBJECTIVES</span>
        <span className="missions-count">
          {doneCount}/{scenario.objectives.length}
        </span>
      </div>
      <ul className="missions-list">
        {results.map(({ o, done }) => (
          <li key={o.id} className={`objective ${done ? 'done' : ''}`}>
            <span className="obj-box">{done ? '✓' : ''}</span>
            <span className="obj-label">{o.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
