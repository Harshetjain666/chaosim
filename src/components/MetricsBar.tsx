import type { IncidentState } from '../state/types.ts';
import { deriveMetrics } from '../state/metrics.ts';

function money(cents: number): string {
  return '$' + Math.floor(cents / 100).toLocaleString('en-US');
}

interface MetricProps {
  label: string;
  value: string;
  bad: boolean;
}

function Metric({ label, value, bad }: MetricProps) {
  return (
    <div className={`m-cell ${bad ? 'bad' : 'ok'}`}>
      <span className="m-label">{label}</span>
      <span className="m-value">{value}</span>
    </div>
  );
}

export function MetricsBar({ state, serviceName }: { state: IncidentState; serviceName: string }) {
  const m = deriveMetrics(state);
  return (
    <div className={`metricsbar ${m.down ? 'down' : 'healthy'}`}>
      <div className="m-status">
        <span className="m-dot" />
        <span className="m-status-label">{m.statusLabel}</span>
        <span className="m-status-svc">{serviceName}</span>
      </div>
      <Metric label="ERROR RATE" value={`${m.errorRatePct.toFixed(0)}%`} bad={m.errorRatePct > 2} />
      <Metric label="FAILED REQUESTS" value={Math.floor(state.failedRequests).toLocaleString('en-US')} bad={m.down} />
      <Metric label="REVENUE LOST" value={money(state.revenueLostCents)} bad={state.revenueLostCents > 0} />
      <Metric label="P95 LATENCY" value={`${Math.round(m.latencyMs)} ms`} bad={m.latencyMs > 1000} />
    </div>
  );
}
