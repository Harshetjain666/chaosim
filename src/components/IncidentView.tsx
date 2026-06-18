import { useEffect, useRef, useState } from 'react';
import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from '../state/types.ts';
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
import { IncidentOverlay } from './IncidentOverlay.tsx';

interface Props {
  scenario: Scenario;
  playerName: string;
  resumeState?: IncidentState;
  onMenu: () => void;
}

export function IncidentView({ scenario, playerName, resumeState, onMenu }: Props) {
  const { state, actions } = useIncident(scenario, resumeState);
  const [kbOpen, setKbOpen] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && !state.started) {
      startedRef.current = true;
      actions.start(playerName);
    }
  }, [actions, playerName, state.started]);

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
      {state.submitted && state.evaluation ? (
        <EvaluationModal evaluation={state.evaluation} playerName={state.playerName} onReplay={replay} onMenu={onMenu} />
      ) : null}
    </div>
  );
}
