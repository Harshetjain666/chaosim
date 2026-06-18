import { useState } from 'react';
import { SCENARIOS } from './scenario/index.ts';
import type { Scenario } from './scenario/types.ts';
import type { IncidentState } from './state/types.ts';
import { clearGame, loadGame, type SaveRecord } from './state/persistence.ts';
import { Welcome } from './components/Welcome.tsx';
import { IncidentView } from './components/IncidentView.tsx';

interface Session {
  scenario: Scenario;
  name: string;
  resumeState?: IncidentState;
}

export function App() {
  const [saved, setSaved] = useState<SaveRecord | null>(() => loadGame());
  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return (
      <Welcome
        scenarios={SCENARIOS}
        saved={saved}
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
      />
    );
  }

  return (
    <IncidentView
      key={session.scenario.id + (session.resumeState ? '-resume' : '-fresh')}
      scenario={session.scenario}
      playerName={session.name}
      resumeState={session.resumeState}
      onMenu={() => {
        setSaved(loadGame());
        setSession(null);
      }}
    />
  );
}
