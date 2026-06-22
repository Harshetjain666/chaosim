import type { Evaluation } from '../state/types.ts';

interface Props {
  evaluation: Evaluation;
  playerName: string;
  onReplay: () => void;
  onMenu: () => void;
  onWatchReplay?: (() => void) | undefined;
}

function tone(score: number): string {
  if (score >= 78) return 'ok';
  if (score >= 50) return 'warn';
  return 'bad';
}

export function EvaluationModal({ evaluation, playerName, onReplay, onMenu, onWatchReplay }: Props) {
  return (
    <div className="modal-overlay">
      <div className="eval-modal">
        <div className="eval-head">
          <span className="eval-tag">EVALUATION COMPLETE</span>
          <h2>{playerName}, here is your incident report.</h2>
        </div>

        <div className="eval-score-row">
          <div className={`eval-grade grade-${evaluation.grade}`}>{evaluation.grade}</div>
          <div className="eval-score-meta">
            <div className="eval-score-num">{evaluation.score}/100</div>
            <div className={`eval-resolved ${evaluation.resolved ? 'ok' : 'bad'}`}>
              {evaluation.resolved ? `Resolved in ${evaluation.timeLabel}` : 'Not resolved'}
            </div>
          </div>
          <div className="eval-percentile">
            <div className="eval-pct-num">{evaluation.percentile}th</div>
            <div className="eval-pct-cap">percentile on this incident</div>
          </div>
        </div>

        <p className="eval-verdict">{evaluation.verdict}</p>

        <div className="eval-categories">
          {evaluation.categories.map((c) => (
            <div key={c.key} className={`eval-cat tone-${tone(c.score)}`}>
              <div className="eval-cat-head">
                <span className="eval-cat-label">{c.label}</span>
                <span className="eval-cat-right">
                  <span className="eval-cat-band">{c.band}</span>
                  <span className="eval-cat-score">{c.score}</span>
                </span>
              </div>
              <div className="eval-cat-bar">
                <div className="eval-cat-fill" style={{ width: `${c.score}%` }} />
              </div>
              <ul className="eval-cat-notes">
                {c.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="eval-actions">
          <button className="btn-ghost-line" onClick={onMenu} type="button">
            ← Pick another incident
          </button>
          {onWatchReplay ? (
            <button className="btn-ghost-line" onClick={onWatchReplay} type="button">
              ▶ Watch your replay
            </button>
          ) : null}
          <button className="enter-btn" onClick={onReplay} type="button">
            RUN THIS INCIDENT AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
