import { STAGES } from '../scenario/types.ts';

const LABELS: Record<string, string> = {
  alerted: 'Alerted',
  diagnosing: 'Diagnosing',
  fixing: 'Fixing',
  testing: 'Testing',
  resolved: 'Resolved',
};

export function Timeline({ stageIndex }: { stageIndex: number }) {
  return (
    <footer className="timeline">
      <span className="timeline-label">TIMELINE</span>
      {STAGES.map((stage, i) => {
        const done = i < stageIndex;
        const current = i === stageIndex;
        return (
          <span key={stage} className={`stage ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
            <span className="stage-dot" />
            {LABELS[stage]}
          </span>
        );
      })}
    </footer>
  );
}
