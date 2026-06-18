import { useState } from 'react';
import type { Scenario } from '../scenario/types.ts';

interface Props {
  scenario: Scenario;
  onClose: () => void;
}

export function KbModal({ scenario, onClose }: Props) {
  const [activeId, setActiveId] = useState(scenario.kb[0]?.id ?? '');
  const active = scenario.kb.find((a) => a.id === activeId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-head">
          <span>KNOWLEDGE BASE</span>
          <button className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="kb-body">
          <ul className="kb-list">
            {scenario.kb.map((a) => (
              <li key={a.id}>
                <button className={activeId === a.id ? 'active' : ''} onClick={() => setActiveId(a.id)} type="button">
                  {a.title}
                </button>
              </li>
            ))}
          </ul>
          <div className="kb-article">
            <h3>{active?.title}</h3>
            <pre>{active?.body}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
