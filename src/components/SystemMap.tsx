import type { Scenario } from '../scenario/types.ts';
import type { IncidentState } from '../state/types.ts';
import { type Health, blastRadius, layoutTopology, nodeHealth, scenarioTopology } from '../state/topology.ts';

interface Props {
  scenario: Scenario;
  state: IncidentState;
  /** Called when the candidate clicks the failing service, to jump to its logs. */
  onFocusService?: () => void;
}

const PAD = 18;
const COL_W = 170;
const ROW_H = 70;
const NODE_W = 132;
const NODE_H = 46;

const KIND_GLYPH: Record<string, string> = {
  client: '🌐',
  edge: '🔀',
  service: '⬡',
  datastore: '🛢',
  external: '☁',
};

function rank(h: Health): number {
  return h === 'down' ? 2 : h === 'degraded' ? 1 : 0;
}

export function SystemMap({ scenario, state, onFocusService }: Props) {
  const topo = scenarioTopology(scenario);
  const { placed, layers } = layoutTopology(topo);
  const maxRows = Math.max(1, ...placed.map((p) => p.rows));

  const width = PAD * 2 + (layers - 1) * COL_W + NODE_W;
  const height = PAD * 2 + maxRows * ROW_H - (ROW_H - NODE_H);

  const center = (id: string): { x: number; y: number } => {
    const p = placed.find((n) => n.id === id)!;
    const x = PAD + p.layer * COL_W + NODE_W / 2;
    const offset = (maxRows - p.rows) / 2;
    const y = PAD + (p.row + offset) * ROW_H + NODE_H / 2;
    return { x, y };
  };

  const health = new Map<string, Health>(placed.map((p) => [p.id, nodeHealth(p, state, topo)]));
  const radius = blastRadius(state, topo);

  return (
    <div className="sysmap">
      <div className="sysmap-head">
        <span className="sysmap-title">SYSTEM MAP</span>
        <span className={`sysmap-blast ${radius > 1 ? 'hot' : ''}`}>
          {state.resolved ? 'all services healthy' : `blast radius · ${radius} service${radius === 1 ? '' : 's'}`}
        </span>
      </div>
      <svg className="sysmap-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Live service map">
        {topo.edges.map((e) => {
          const a = center(e.from);
          const b = center(e.to);
          const sev = Math.max(rank(health.get(e.from) ?? 'healthy'), rank(health.get(e.to) ?? 'healthy'));
          const cls = sev === 2 ? 'down' : sev === 1 ? 'degraded' : 'healthy';
          const flowing = sev === 2;
          return (
            <line
              key={`${e.from}-${e.to}`}
              className={`sysmap-edge ${cls} ${flowing ? 'flow' : ''}`}
              x1={a.x + NODE_W / 2}
              y1={a.y}
              x2={b.x - NODE_W / 2}
              y2={b.y}
            />
          );
        })}

        {placed.map((p) => {
          const c = center(p.id);
          const h = health.get(p.id) ?? 'healthy';
          const isRoot = p.id === topo.rootId;
          const clickable = isRoot && !!onFocusService;
          return (
            <g
              key={p.id}
              className={`sysmap-node ${h} ${isRoot ? 'root' : ''} ${clickable ? 'clickable' : ''}`}
              transform={`translate(${c.x - NODE_W / 2}, ${c.y - NODE_H / 2})`}
              onClick={clickable ? onFocusService : undefined}
            >
              {isRoot && !state.resolved ? (
                <rect className="sysmap-ring" x={-4} y={-4} width={NODE_W + 8} height={NODE_H + 8} rx={11} />
              ) : null}
              <rect className="sysmap-box" width={NODE_W} height={NODE_H} rx={9} />
              <text className="sysmap-glyph" x={15} y={NODE_H / 2 + 5}>
                {KIND_GLYPH[p.kind] ?? '⬡'}
              </text>
              <text className="sysmap-label" x={36} y={NODE_H / 2 - 3}>
                {p.label}
              </text>
              <text className="sysmap-state" x={36} y={NODE_H / 2 + 13}>
                {state.resolved ? 'healthy' : h}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
