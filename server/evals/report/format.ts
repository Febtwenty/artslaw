import { Aggregates } from '../metrics/metrics';

export function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
}

export function ms(v: number | null): string {
  return v === null ? '—' : `${Math.round(v)}ms`;
}

export function usd(v: number | null): string {
  return v === null ? '—' : `$${v.toFixed(5)}`;
}

export interface MetricRow {
  label: string;
  get: (a: Aggregates) => string;
}

export const METRIC_ROWS: MetricRow[] = [
  { label: 'Groundedness (claims supported)', get: (a) => pct(a.groundedness) },
  { label: 'Contradiction rate', get: (a) => pct(a.contradictionRate) },
  { label: 'Claims judged', get: (a) => String(a.totalClaims) },
  { label: 'Hedging pass rate (no-evidence)', get: (a) => pct(a.hedgingPassRate) },
  { label: 'Tool-call accuracy', get: (a) => pct(a.toolCallAccuracy) },
  { label: 'Tool-args validity', get: (a) => pct(a.toolArgsValidity) },
  { label: 'Loop termination rate', get: (a) => pct(a.loopTerminationRate) },
  { label: 'Source-integrity violations', get: (a) => String(a.sourceIntegrityViolations) },
  { label: 'Discovery parse rate', get: (a) => pct(a.discoveryParseRate) },
  { label: 'Hallucinated-URL rate', get: (a) => pct(a.hallucinatedUrlRate) },
  { label: 'Discovery expectation rate', get: (a) => pct(a.discoveryExpectationRate) },
  { label: 'Structure rate (regex)', get: (a) => pct(a.structureRate) },
  { label: 'Structure rate (judge)', get: (a) => pct(a.judgeStructureRate) },
  { label: 'Language match (heuristic)', get: (a) => pct(a.languageMatchRate) },
  { label: 'Language match (judge)', get: (a) => pct(a.judgeLanguageRate) },
  { label: 'Latency p50 / p95', get: (a) => `${ms(a.latencyP50Ms)} / ${ms(a.latencyP95Ms)}` },
  { label: 'TTFT p50', get: (a) => ms(a.ttftP50Ms) },
  { label: 'Cost per tour (mean)', get: (a) => usd(a.costPerTourUsd) },
  { label: 'App cost (this run)', get: (a) => usd(a.totalAppCostUsd) },
  { label: 'Runs / errors', get: (a) => `${a.runs} / ${a.errors}` },
];
