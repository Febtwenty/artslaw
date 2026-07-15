import { Aggregates } from '../metrics/metrics';
import { Provider } from '../scenarios/types';

// Deliberately loose: even with fixed evidence (replay mode), model outputs
// are non-deterministic, so small metric wobble is expected. These catch
// real regressions, not noise.
export const THRESHOLDS = {
  maxGroundednessDropPts: 0.05,
  maxContradictionRisePts: 0.03,
  maxToolCallAccuracyDropPts: 0.1,
  // Relative regressions, gated in replay mode only (evidence latency constant)
  maxLatencyP95RiseRatio: 0.25,
  maxCostPerTourRiseRatio: 0.25,
  // Absolute gates (baseline-independent)
  minDiscoveryParseRate: 1.0,
  maxSourceIntegrityViolations: 0,
};

export interface Baseline {
  provider: Provider;
  chatModel: string;
  createdAt: string;
  repeat: number;
  mode: string;
  aggregates: Aggregates;
}

export interface GateResult {
  failures: string[];
}

function fmtPct(v: number | null): string {
  return v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`;
}

export function gate(agg: Aggregates, baseline: Baseline | null, replayMode: boolean): GateResult {
  const failures: string[] = [];
  const t = THRESHOLDS;

  // Absolute gates
  if (agg.discoveryParseRate !== null && agg.discoveryParseRate < t.minDiscoveryParseRate) {
    failures.push(`discovery parse rate ${fmtPct(agg.discoveryParseRate)} < ${fmtPct(t.minDiscoveryParseRate)}`);
  }
  if (agg.sourceIntegrityViolations > t.maxSourceIntegrityViolations) {
    failures.push(`${agg.sourceIntegrityViolations} source-integrity violation(s) (sources not from served Tavily results)`);
  }
  if (agg.errors > 0) {
    failures.push(`${agg.errors} run(s) errored`);
  }

  if (!baseline) return { failures };
  const base = baseline.aggregates;

  if (agg.groundedness !== null && base.groundedness !== null) {
    const drop = base.groundedness - agg.groundedness;
    if (drop > t.maxGroundednessDropPts) {
      failures.push(`groundedness dropped ${fmtPct(agg.groundedness)} vs baseline ${fmtPct(base.groundedness)} (max drop ${fmtPct(t.maxGroundednessDropPts)})`);
    }
  }
  if (agg.contradictionRate !== null && base.contradictionRate !== null) {
    const rise = agg.contradictionRate - base.contradictionRate;
    if (rise > t.maxContradictionRisePts) {
      failures.push(`contradiction rate rose ${fmtPct(agg.contradictionRate)} vs baseline ${fmtPct(base.contradictionRate)} (max rise ${fmtPct(t.maxContradictionRisePts)})`);
    }
  }
  if (agg.toolCallAccuracy !== null && base.toolCallAccuracy !== null) {
    const drop = base.toolCallAccuracy - agg.toolCallAccuracy;
    if (drop > t.maxToolCallAccuracyDropPts) {
      failures.push(`tool-call accuracy dropped ${fmtPct(agg.toolCallAccuracy)} vs baseline ${fmtPct(base.toolCallAccuracy)} (max drop ${fmtPct(t.maxToolCallAccuracyDropPts)})`);
    }
  }

  if (replayMode) {
    if (agg.latencyP95Ms !== null && base.latencyP95Ms !== null && base.latencyP95Ms > 0) {
      const ratio = agg.latencyP95Ms / base.latencyP95Ms - 1;
      if (ratio > t.maxLatencyP95RiseRatio) {
        failures.push(`latency p95 ${Math.round(agg.latencyP95Ms)}ms vs baseline ${Math.round(base.latencyP95Ms)}ms (+${(ratio * 100).toFixed(0)}%, max +${t.maxLatencyP95RiseRatio * 100}%)`);
      }
    }
    if (agg.costPerTourUsd !== null && base.costPerTourUsd !== null && base.costPerTourUsd > 0) {
      const ratio = agg.costPerTourUsd / base.costPerTourUsd - 1;
      if (ratio > t.maxCostPerTourRiseRatio) {
        failures.push(`cost/tour $${agg.costPerTourUsd.toFixed(5)} vs baseline $${base.costPerTourUsd.toFixed(5)} (+${(ratio * 100).toFixed(0)}%, max +${t.maxCostPerTourRiseRatio * 100}%)`);
      }
    }
  }

  return { failures };
}
