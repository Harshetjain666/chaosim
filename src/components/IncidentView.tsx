import { useState } from 'react';
import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from '../state/types.ts';
import type { RunRecord } from '../state/runs.ts';
import { useIncident } from '../state/useIncident.ts';
import { TopBar } from './TopBar.tsx';
import { MetricsBar } from './MetricsBar.tsx';
import { Explorer } from './Explorer.tsx';
import { MissionPanel } from './MissionPanel.tsx';
import { Editor } from './Editor.tsx';
import { CeoChat } from './CeoChat.tsx';
import { Terminal } from './Terminal.tsx';
import { Timeline } from './Timeline.tsx';
import { KbModal } from './KbModal.tsx';
import { EvaluationModal } from './EvaluationModal.tsx';
import { EntryPrimer } from './EntryPrimer.tsx';
import { SystemMap } from './SystemMap.tsx';
import { IncidentOverlay } from './IncidentOverlay.tsx';

interface Props {
  scenario: Scenario;
  playerName: string;
  resumeState?: IncidentState;
  onMenu: () => void;
  onWatchReplay: (run: RunRecord) => void;
}

export function IncidentView({ scenario, playerName, resumeState, onMenu, onWatchReplay }: Props) {
  const { state, actions, lastRun } = useIncident(scenario, resumeState);
  const [kbOpen, setKbOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(true);

  // A fresh incident shows the brief first; the clock starts only when the
  // candidate presses enter. A resumed incident is already running.
  const begin = () => actions.start(playerName);
  const showPrimer = !state.started && !resumeState;
  const errorLogPath = scenario.files.find((f) => f.path.endsWith('error.log'))?.path;

  const replay = () => {
    actions.reset();
    actions.start(playerName);
  };

  return (
    <div className="console">
      <TopBar
        scenario={scenario}
        elapsed={state.elapsed}
        onExit={onMenu}
        onOpenKb={() => {
          setKbOpen(true);
          actions.openKb();
        }}
        onSubmit={actions.submit}
      />
      <MetricsBar state={state} serviceName={scenario.serviceName} />

      <div className={`sysmap-strip ${mapOpen ? 'open' : 'closed'}`}>
        <button className="sysmap-toggle" onClick={() => setMapOpen((v) => !v)} type="button">
          {mapOpen ? '▾' : '▸'} SYSTEM MAP
        </button>
        {mapOpen ? (
          <SystemMap
            scenario={scenario}
            state={state}
            onFocusService={errorLogPath ? () => actions.openFile(errorLogPath) : undefined}
          />
        ) : null}
      </div>

      <main className="workspace">
        <div className="left-col">
          <Explorer scenario={scenario} activeTab={state.activeTab} onOpen={actions.openFile} />
          <MissionPanel scenario={scenario} state={state} />
        </div>

        <Editor
          scenario={scenario}
          openTabs={state.openTabs}
          activeTab={state.activeTab}
          fileContents={state.fileContents}
          logFeed={state.logFeed}
          resolved={state.resolved}
          onSetActive={actions.setActive}
          onClose={actions.closeTab}
          onEdit={actions.editFile}
        />

        <div className="right-col">
          <CeoChat scenario={scenario} chat={state.chat} onReply={actions.ceoReply} />
          <Terminal lines={state.terminal} onRun={actions.runCommand} />
        </div>
      </main>

      <Timeline stageIndex={state.stageIndex} />

      <IncidentOverlay event={state.activeEvent} onDismiss={actions.dismissEvent} />

      {kbOpen ? <KbModal scenario={scenario} onClose={() => setKbOpen(false)} /> : null}
      {showPrimer ? <EntryPrimer scenario={scenario} onBegin={begin} /> : null}
      {state.submitted && state.evaluation ? (
        <EvaluationModal
          evaluation={state.evaluation}
          playerName={state.playerName}
          onReplay={replay}
          onMenu={onMenu}
          onWatchReplay={lastRun ? () => onWatchReplay(lastRun) : undefined}
        />
      ) : null}
    </div>
  );
}
