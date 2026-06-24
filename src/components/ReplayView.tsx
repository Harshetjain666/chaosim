import { useEffect, useMemo, useState } from 'react';
import { SCENARIOS } from '../scenario/index.ts';
import type { RunRecord } from '../state/runs.ts';
import { reconstructAt } from '../state/replay.ts';
import { clock } from '../format.ts';
import { MetricsBar } from './MetricsBar.tsx';
import { SystemMap } from './SystemMap.tsx';
import { Explorer } from './Explorer.tsx';
import { MissionPanel } from './MissionPanel.tsx';
import { Editor } from './Editor.tsx';
import { CeoChat } from './CeoChat.tsx';
import { Terminal } from './Terminal.tsx';
import { Timeline } from './Timeline.tsx';

const noop = () => {};

interface Props {
  run: RunRecord;
  onBack: () => void;
}

export function ReplayView({ run, onBack }: Props) {
  const scenario = SCENARIOS.find((s) => s.id === run.scenarioId);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        if (prev >= run.durationElapsed) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 110);
    return () => clearInterval(id);
  }, [playing, run.durationElapsed]);

  const state = useMemo(
    () => (scenario ? reconstructAt(scenario, run.actionLog, t) : null),
    [scenario, run, t],
  );

  if (!scenario || !state) {
    return (
      <div className="results-page">
        <div className="results-card">
          <p className="results-empty">This run references an incident that is not loaded.</p>
          <button className="btn-ghost-line" onClick={onBack} type="button">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="console">
      <header className="topbar">
        <div className="topbar-left">
          <button className="logo" onClick={onBack} type="button" title="Back to runs">
            ← CHAOS SIM
          </button>
          <span className="incident-chip">{run.scenarioCode} · REPLAY</span>
          <span className="replay-who">
            {run.playerName} · grade {run.grade} · {run.percentile}th pct
          </span>
        </div>
        <div className="topbar-center">
          <span className="demo-label">REPLAY</span>
          <span className="demo-clock">
            {clock(t)} / {clock(run.durationElapsed)}
          </span>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            if (t >= run.durationElapsed) setT(0);
            setPlaying((p) => !p);
          }}
          type="button"
        >
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
      </header>

      <MetricsBar state={state} serviceName={scenario.serviceName} />

      <div className="sysmap-strip open">
        <SystemMap scenario={scenario} state={state} />
      </div>

      <div className="replay-scrub">
        <input
          type="range"
          min={0}
          max={run.durationElapsed}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
        />
      </div>

      <main className="workspace">
        <div className="left-col">
          <Explorer scenario={scenario} activeTab={state.activeTab} onOpen={noop} />
          <MissionPanel scenario={scenario} state={state} />
        </div>
        <Editor
          scenario={scenario}
          openTabs={state.openTabs}
          activeTab={state.activeTab}
          fileContents={state.fileContents}
          logFeed={state.logFeed}
          resolved={state.resolved}
          onSetActive={noop}
          onClose={noop}
          onEdit={noop}
        />
        <div className="right-col">
          <CeoChat scenario={scenario} chat={state.chat} onReply={noop} />
          <Terminal lines={state.terminal} onRun={noop} />
        </div>
      </main>

      <Timeline stageIndex={state.stageIndex} />
    </div>
  );
}
