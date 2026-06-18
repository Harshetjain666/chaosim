import { useEffect, useRef, useState } from 'react';
import type { Scenario } from '../scenario/types.ts';
import type { ChatMessage } from '../state/types.ts';

interface Props {
  scenario: Scenario;
  chat: ChatMessage[];
  onReply: (text: string) => void;
}

export function CeoChat({ scenario, chat, onReply }: Props) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length]);

  return (
    <section className="ceo">
      <div className="ceo-head">
        <span className="ceo-dot" />
        <span className="ceo-name">{scenario.ceoName.toUpperCase()}</span>
        <span className="ceo-role">· {scenario.ceoRole}</span>
        <span className="urgent">URGENT</span>
      </div>

      <div className="ceo-thread">
        {chat.map((m) => (
          <div key={m.id} className={`bubble ${m.from}`}>
            {m.from === 'ceo' ? <div className="bubble-from">{scenario.ceoName} · CEO</div> : null}
            <div className="bubble-text">{m.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="ceo-reply"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() === '') return;
          onReply(draft);
          setDraft('');
        }}
      >
        <input
          placeholder={`Reply to ${scenario.ceoName.split(' ')[0]}...`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit">SEND</button>
      </form>
    </section>
  );
}
