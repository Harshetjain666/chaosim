import { useState } from 'react';
import { SCENARIOS } from './scenario/index.ts';
import type { Scenario } from './scenario/types.ts';
import type { IncidentState } from './state/types.ts';
import { clearGame, loadGame, type SaveRecord } from './state/persistence.ts';
import { listRuns, type RunRecord } from './state/runs.ts';
import { Welcome } from './components/Welcome.tsx';
import { IncidentView } from './components/IncidentView.tsx';
import { ResultsView } from './components/ResultsView.tsx';
import { ReplayView } from './components/ReplayView.tsx';

interface Session {
  scenario: Scenario;
  name: string;
  resumeState?: IncidentState;
}

export function App() {
  const [saved, setSaved] = useState<SaveRecord | null>(() => loadGame());
  const [runsCount, setRunsCount] = useState<number>(() => listRuns().length);
  const [session, setSession] = useState<Session | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [replayRun, setReplayRun] = useState<RunRecord | null>(null);

  if (session) {
    return (
      <IncidentView
        key={session.scenario.id + (session.resumeState ? '-resume' : '-fresh')}
        scenario={session.scenario}
        playerName={session.name}
        resumeState={session.resumeState}
        onMenu={() => {
          setSaved(loadGame());
          setRunsCount(listRuns().length);
          setSession(null);
        }}
      />
    );
  }

  if (replayRun) {
    return <ReplayView run={replayRun} onBack={() => setReplayRun(null)} />;
  }

  if (showResults) {
    return <ResultsView onReplay={(run) => setReplayRun(run)} onBack={() => setShowResults(false)} />;
  }

  return (
    <Welcome
      scenarios={SCENARIOS}
      saved={saved}
      runsCount={runsCount}
      onEnter={(scenario, name) => {
        clearGame();
        setSaved(null);
        setSession({ scenario, name });
      }}
      onResume={() => {
        const game = loadGame();
        if (!game) return;
        const scenario = SCENARIOS.find((s) => s.id === game.scenarioId);
        if (!scenario) return;
        setSession({ scenario, name: game.playerName, resumeState: game.state });
      }}
      onViewResults={() => setShowResults(true)}
    />
  );
}
