import type { Scenario, SourceFile } from '../scenario/types.ts';
import { FILE_BADGE } from '../format.ts';

interface Props {
  scenario: Scenario;
  activeTab: string | null;
  onOpen: (path: string) => void;
}

export function Explorer({ scenario, activeTab, onOpen }: Props) {
  // Group in encounter order so any scenario's services render, with the
  // unlabelled "root" group always last.
  const order: string[] = [];
  const byGroup = new Map<string, SourceFile[]>();
  for (const f of scenario.files) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      if (f.group !== 'root') order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  if (byGroup.has('root')) order.push('root');

  return (
    <aside className="explorer">
      <div className="panel-head">● EXPLORER</div>
      <div className="tree">
        <div className="tree-root">src</div>
        {order.map((group) => {
          const files = byGroup.get(group) ?? [];
          return (
            <div key={group} className="tree-group">
              {group !== 'root' ? <div className="group-label">{group}</div> : null}
              {files.map((f) => (
                <button
                  key={f.path}
                  className={`tree-file ${activeTab === f.path ? 'active' : ''} ${f.language === 'log' ? 'is-log' : ''}`}
                  onClick={() => onOpen(f.path)}
                  type="button"
                >
                  <span className="file-badge">{FILE_BADGE[f.language]}</span>
                  <span className="file-name">{f.name}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
