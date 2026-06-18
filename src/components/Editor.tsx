import { useEffect, useRef } from 'react';
import type { Scenario, SourceFile } from '../scenario/types.ts';

interface Props {
  scenario: Scenario;
  openTabs: string[];
  activeTab: string | null;
  fileContents: Record<string, string>;
  logFeed: string[];
  resolved: boolean;
  onSetActive: (path: string) => void;
  onClose: (path: string) => void;
  onEdit: (path: string, content: string) => void;
}

function fileByPath(scenario: Scenario, path: string): SourceFile | undefined {
  return scenario.files.find((f) => f.path === path);
}

function isErrorLog(path: string | null | undefined): boolean {
  return !!path && path.endsWith('error.log');
}

export function Editor({
  scenario,
  openTabs,
  activeTab,
  fileContents,
  logFeed,
  resolved,
  onSetActive,
  onClose,
  onEdit,
}: Props) {
  const active = activeTab ? fileByPath(scenario, activeTab) : undefined;
  const live = isErrorLog(activeTab);
  const bodyRef = useRef<HTMLDivElement>(null);

  const base = activeTab ? (fileContents[activeTab] ?? '') : '';
  const content = live ? [base.replace(/\n$/, ''), ...logFeed].join('\n') : base;

  // Keep the streaming firehose pinned to the newest line.
  useEffect(() => {
    if (live && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [live, logFeed.length]);

  return (
    <section className="editor">
      <div className="panel-head editor-head">
        <span>● EDITOR</span>
        {live && !resolved ? <span className="live-tag">● LIVE</span> : null}
      </div>

      <div className="tabbar">
        {openTabs.map((path) => {
          const f = fileByPath(scenario, path);
          if (!f) return null;
          return (
            <div key={path} className={`tab ${activeTab === path ? 'active' : ''}`} onClick={() => onSetActive(path)}>
              <span>{f.name}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(path);
                }}
                type="button"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <div className="editor-body" ref={bodyRef}>
        {!active ? (
          <div className="editor-empty">Open a file from the explorer to read it. Start with logs/error.log.</div>
        ) : active.editable ? (
          <textarea
            className={`code-area lang-${active.language}`}
            value={base}
            spellCheck={false}
            onChange={(e) => onEdit(active.path, e.target.value)}
          />
        ) : (
          <pre className={`code-view lang-${active.language}`}>{content}</pre>
        )}
      </div>

      {active?.editable ? <div className="editor-foot">editable · save happens as you type</div> : null}
    </section>
  );
}
