import { useEffect } from 'react';
import type { IncidentEvent } from '../scenario/types.ts';

interface Props {
  event: IncidentEvent | null;
  onDismiss: () => void;
}

const KIND_TAG: Record<IncidentEvent['kind'], string> = {
  escalation: 'ESCALATION',
  boss_call: 'INCOMING CALL',
  system: 'UPDATE',
};

export function IncidentOverlay({ event, onDismiss }: Props) {
  const isResolved = event?.id === 'resolved';
  const isCall = event?.kind === 'boss_call';

  // Escalations fade on their own. A boss call and the resolution beat both
  // wait for the player, so the interruption and the win each get their moment.
  useEffect(() => {
    if (!event || isCall || isResolved) return;
    const id = setTimeout(onDismiss, 6500);
    return () => clearTimeout(id);
  }, [event, isCall, isResolved, onDismiss]);

  if (!event) return null;
  const tag = isResolved ? 'RESOLVED' : KIND_TAG[event.kind];

  return (
    <div
      className={`event-overlay kind-${event.kind} ${isResolved ? 'resolved' : ''}`}
      onClick={isCall ? undefined : onDismiss}
    >
      <div className="event-card">
        <span className="event-tag">{tag}</span>
        <h2 className="event-title">{event.title}</h2>
        <p className="event-body">{event.body}</p>
        <button
          className={`event-dismiss ${isResolved ? 'good' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          type="button"
        >
          {isCall ? 'Answer →' : isResolved ? 'Continue' : 'Acknowledge'}
        </button>
      </div>
    </div>
  );
}
