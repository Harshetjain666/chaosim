import { Fragment, useState } from 'react';
import type { Scenario } from '../scenario/types.ts';
import type { SaveRecord } from '../state/persistence.ts';
import { clock } from '../format.ts';

interface Props {
  scenarios: Scenario[];
  saved: SaveRecord | null;
  runsCount: number;
  onEnter: (scenario: Scenario, name: string) => void;
  onResume: () => void;
  onViewResults: () => void;
}

type Mode = 'candidate' | 'demo';

function cards(ceoName: string) {
  const first = ceoName.split(' ')[0] || 'The CEO';
  return [
    { glyph: '🗂', title: 'File Tree', body: 'Browse and open system files. Every open is tracked.' },
    { glyph: '💬', title: 'CEO Chat', body: `${first} is watching. Keep them posted. Every reply counts.` },
    { glyph: '⚡', title: 'Terminal', body: 'Run commands. Logs, tests, restarts, all tracked.' },
    { glyph: '📚', title: 'Docs', body: 'Open the [KB] knowledge base. Look things up.' },
  ];
}

export function Welcome({ scenarios, saved, runsCount, onEnter, onResume, onViewResults }: Props) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('candidate');
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? '');

  // A candidate is assigned one incident, the way real on-call works. We pick a
  // hand-authored one at random and keep it stable for the session. The demo
  // view exposes the full picker for us and for evaluators.
  const [assigned] = useState<Scenario | undefined>(() => {
    const pool = scenarios.filter((s) => !s.generated);
    const list = pool.length > 0 ? pool : scenarios;
    return list[Math.floor(Math.random() * list.length)];
  });

  const selected = mode === 'candidate' ? assigned : scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const savedScenario = saved ? scenarios.find((s) => s.id === saved.scenarioId) : undefined;

  return (
    <div className="welcome-overlay">
      <div className="welcome-card">
        <div className="welcome-toprow">
          <span className="live-badge">● LIVE INCIDENT</span>
          <div className="welcome-toprow-right">
            <div className="mode-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={mode === 'candidate' ? 'active' : ''}
                onClick={() => setMode('candidate')}
              >
                Candidate
              </button>
              <button type="button" className={mode === 'demo' ? 'active' : ''} onClick={() => setMode('demo')}>
                Demo
              </button>
            </div>
            {runsCount > 0 ? (
              <button className="results-link" onClick={onViewResults} type="button">
                Evaluator view · {runsCount} run{runsCount === 1 ? '' : 's'} →
              </button>
            ) : null}
          </div>
        </div>
        <h1 className="welcome-title">
          Welcome to <span className="accent">CHAOS SIM</span>
        </h1>
        <p className="welcome-brief">{selected?.briefing}</p>

        {saved && savedScenario ? (
          <button className="resume-btn" onClick={onResume} type="button">
            <span className="resume-label">RESUME IN PROGRESS</span>
            <span className="resume-meta">
              {savedScenario.code} · {savedScenario.title} · {clock(saved.state.elapsed)} in →
            </span>
          </button>
        ) : null}

        {mode === 'candidate' ? (
          selected ? (
            <div className="assigned-incident">
              <span className="assigned-label">● YOU ARE ON CALL · ASSIGNED INCIDENT</span>
              <div className="assigned-row">
                <span className="io-code">{selected.code}</span>
                <span className="io-title">{selected.title}</span>
              </div>
            </div>
          ) : null
        ) : scenarios.length > 1 ? (
          <div className="incident-picker">
            {scenarios.map((s, i) => {
              const prev = scenarios[i - 1];
              const showGenHeader = !!s.generated && !prev?.generated;
              return (
                <Fragment key={s.id}>
                  {showGenHeader ? (
                    <span className="picker-group-label">
                      Generated for {s.generatedFor ?? 'your company'} · auto validated
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`incident-opt ${selectedId === s.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="io-code">{s.code}</span>
                    <span className="io-title">{s.title}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        ) : null}

        <div className="welcome-cards">
          {cards(selected?.ceoName ?? 'The CEO').map((c) => (
            <div key={c.title} className="welcome-feature">
              <div className="feature-title">
                <span>{c.glyph}</span> {c.title}
              </div>
              <p>{c.body}</p>
            </div>
          ))}
        </div>

        <form
          className="welcome-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected) onEnter(selected, name);
          }}
        >
          <input
            className="name-input"
            placeholder="Your name (e.g. Alex Chen)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="enter-btn" type="submit">
            ENTER THE INCIDENT →
          </button>
        </form>
      </div>
    </div>
  );
}
