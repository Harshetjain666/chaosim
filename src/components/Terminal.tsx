import { useEffect, useRef, useState } from 'react';
import type { TerminalLine } from '../state/types.ts';

interface Props {
  lines: TerminalLine[];
  onRun: (command: string) => void;
}

export function Terminal({ lines, onRun }: Props) {
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [lines.length]);

  const submit = () => {
    const cmd = draft.trim();
    if (cmd === '') return;
    onRun(cmd);
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);
    setDraft('');
  };

  return (
    <section className="terminal">
      <div className="terminal-head">
        <span className="ceo-dot green" />
        <span>TERMINAL</span>
        <span className="term-shell">BASH</span>
      </div>

      <div className="terminal-body">
        {lines.map((l, i) => (
          <div key={i} className={`term-line ${l.kind}`}>
            {l.kind === 'in' ? <span className="term-prompt">chaos-sim:~$ </span> : null}
            {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="terminal-input">
        <span className="term-prompt">chaos-sim:~$</span>
        <input
          value={draft}
          placeholder="run a command…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'ArrowUp' && history.length > 0) {
              const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
              setHistIdx(idx);
              setDraft(history[idx] ?? '');
            } else if (e.key === 'ArrowDown' && histIdx >= 0) {
              const idx = histIdx + 1;
              if (idx >= history.length) {
                setHistIdx(-1);
                setDraft('');
              } else {
                setHistIdx(idx);
                setDraft(history[idx] ?? '');
              }
            }
          }}
        />
      </div>
    </section>
  );
}
