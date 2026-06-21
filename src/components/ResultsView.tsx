import { useState } from 'react';
import { clearRuns, listRuns, type RunRecord } from '../state/runs.ts';
import { clock } from '../format.ts';

interface Props {
  onReplay: (run: RunRecord) => void;
  onBack: () => void;
}

export function ResultsView({ onReplay, onBack }: Props) {
  const [runs, setRuns] = useState<RunRecord[]>(() => listRuns());

  return (
    <div className="results-page">
      <div className="results-card">
        <div className="results-head">
          <div>
            <span className="eval-tag">EVALUATOR VIEW</span>
            <h1>Candidate runs</h1>
          </div>
          <button className="btn-ghost-line" onClick={onBack} type="button">
            ← Back to incidents
          </button>
        </div>

        {runs.length === 0 ? (
          <p className="results-empty">No runs yet. Play an incident and submit it, then it appears here with a full replay.</p>
        ) : (
          <>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Incident</th>
                  <th>Result</th>
                  <th>Grade</th>
                  <th>Percentile</th>
                  <th>Time</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} onClick={() => onReplay(r)}>
                    <td className="r-name">{r.playerName}</td>
                    <td className="r-incident">{r.scenarioCode} · {r.scenarioTitle}</td>
                    <td className={r.resolved ? 'ok' : 'bad'}>{r.resolved ? 'Resolved' : 'Unresolved'}</td>
                    <td className={`r-grade grade-${r.grade}`}>{r.grade}</td>
                    <td>{r.percentile}th</td>
                    <td>{clock(r.durationElapsed)}</td>
                    <td className="r-watch">watch replay →</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="btn-ghost-line clear-runs"
              onClick={() => {
                clearRuns();
                setRuns([]);
              }}
              type="button"
            >
              Clear all runs
            </button>
          </>
        )}
      </div>
    </div>
  );
}
