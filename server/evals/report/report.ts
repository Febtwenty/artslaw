import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { RESULTS_DIR } from '../config';
import { EvalScenario, Provider } from '../scenarios/types';
import { Aggregates, ScoredRun } from '../metrics/metrics';
import { Baseline, GateResult } from '../baseline/thresholds';
import { METRIC_ROWS, pct, ms, usd } from './format';

export interface RunMeta {
  mode: string;
  repeat: number;
  providers: Provider[];
  startedAt: string;
  gitSha: string;
  chatModels: Record<Provider, string>;
  judgeModel: string;
}

export interface ProviderReport {
  aggregates: Aggregates;
  baseline: Baseline | null;
  gate: GateResult;
  runs: ScoredRun[];
}

export function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function writeResults(
  meta: RunMeta,
  scenarios: EvalScenario[],
  reports: Partial<Record<Provider, ProviderReport>>,
): { dir: string } {
  const stamp = meta.startedAt.replace(/[:.]/g, '-');
  const dir = path.join(RESULTS_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'results.json'),
    JSON.stringify({ meta, scenarios: scenarios.map((s) => s.id), reports }, null, 2),
    'utf8',
  );
  fs.writeFileSync(path.join(dir, 'report.md'), buildMarkdown(meta, reports), 'utf8');
  return { dir };
}

function worstOffenders(runs: ScoredRun[], limit = 8): string[] {
  const lines: string[] = [];
  for (const r of runs) {
    if (!r.judge?.verdict) continue;
    for (const claim of r.judge.verdict.claims) {
      if (claim.verdict === 'supported') continue;
      lines.push(
        `- **${claim.verdict}** (${r.record.scenarioId}, ${r.record.provider}): "${claim.claim}"` +
          (claim.evidence_quote ? ` — evidence: "${claim.evidence_quote}"` : ''),
      );
    }
  }
  return lines.slice(0, limit);
}

export function buildMarkdown(meta: RunMeta, reports: Partial<Record<Provider, ProviderReport>>): string {
  const providers = meta.providers.filter((p) => reports[p]);
  const md: string[] = [];

  md.push(`# ArtSlaw Eval Report`);
  md.push('');
  md.push(`- Started: ${meta.startedAt}`);
  md.push(`- Mode: **${meta.mode}** · Repeat: ${meta.repeat} · Git: \`${meta.gitSha}\``);
  md.push(`- Chat models: ${providers.map((p) => `${p}=\`${meta.chatModels[p]}\``).join(', ')} · Judge: \`${meta.judgeModel}\``);
  const evalCost = providers.reduce((s, p) => s + reports[p]!.aggregates.judgeCostUsd, 0);
  md.push(`- **Eval cost (judge)**: ${usd(evalCost)} — separate from app cost`);
  md.push('');

  md.push(`## Metrics (side by side)`);
  md.push('');
  md.push(`| Metric | ${providers.join(' | ')} |`);
  md.push(`|---|${providers.map(() => '---').join('|')}|`);
  for (const row of METRIC_ROWS) {
    md.push(`| ${row.label} | ${providers.map((p) => row.get(reports[p]!.aggregates)).join(' | ')} |`);
  }
  md.push('');

  md.push(`## Baseline gate`);
  md.push('');
  for (const p of providers) {
    const r = reports[p]!;
    if (!r.baseline) {
      md.push(`- **${p}**: no baseline — run \`npm run eval:baseline\` to create one`);
    } else if (r.gate.failures.length === 0) {
      md.push(`- **${p}**: ✅ pass (baseline ${r.baseline.createdAt}, ${r.baseline.mode}, repeat ${r.baseline.repeat})`);
    } else {
      md.push(`- **${p}**: ❌ FAIL`);
      for (const f of r.gate.failures) md.push(`  - ${f}`);
    }
  }
  md.push('');

  md.push(`## Per-scenario drill-down`);
  md.push('');
  md.push(`| Scenario | Provider | Kind | Grounded | Tool calls | Latency | Cost | Notes |`);
  md.push(`|---|---|---|---|---|---|---|---|`);
  for (const p of providers) {
    for (const r of reports[p]!.runs) {
      const rec = r.record;
      let grounded = '—';
      if (r.judge?.verdict) {
        const claims = r.judge.verdict.claims;
        const s = claims.filter((c) => c.verdict === 'supported').length;
        grounded = claims.length ? `${s}/${claims.length}` : '0 claims';
      }
      const notes: string[] = [];
      if (rec.error) notes.push(`ERROR: ${rec.error.slice(0, 80)}`);
      if (r.checks.toolCallExpectationMet === false) notes.push('tool-call expectation missed');
      if (r.checks.structureOk === false) notes.push('structure missing');
      if (r.checks.languageOk === false) notes.push('wrong language');
      if (r.checks.sourceIntegrityOk === false) notes.push('source integrity!');
      if (r.checks.hedgingPass === false) notes.push('hedging failed');
      if (r.checks.discoveryExpectationMet === false) notes.push('candidate-count expectation missed');
      if (rec.discovery) notes.push(`${rec.discovery.validatedCount}/${rec.discovery.proposedCount} candidates kept`);
      md.push(
        `| ${rec.scenarioId}${meta.repeat > 1 ? ` #${rec.repeatIndex + 1}` : ''} | ${p} | ${rec.kind} | ${grounded} | ` +
          `${rec.toolCalls?.length ?? '—'} | ${ms(rec.latencyMs)} | ${usd(r.appCostUsd)} | ${notes.join('; ') || ''} |`,
      );
    }
  }
  md.push('');

  const offenders = providers.flatMap((p) => worstOffenders(reports[p]!.runs));
  if (offenders.length > 0) {
    md.push(`## Worst offenders (unsupported / contradicted claims)`);
    md.push('');
    md.push(...offenders.slice(0, 12));
    md.push('');
  }

  return md.join('\n');
}

export function printConsole(meta: RunMeta, reports: Partial<Record<Provider, ProviderReport>>): void {
  const providers = meta.providers.filter((p) => reports[p]);
  const labelWidth = Math.max(...METRIC_ROWS.map((r) => r.label.length)) + 2;
  const colWidth = 18;

  console.log('');
  console.log(`ArtSlaw evals — mode=${meta.mode} repeat=${meta.repeat} git=${meta.gitSha}`);
  console.log('');
  console.log('Metric'.padEnd(labelWidth) + providers.map((p) => p.padStart(colWidth)).join(''));
  console.log('-'.repeat(labelWidth + colWidth * providers.length));
  for (const row of METRIC_ROWS) {
    console.log(
      row.label.padEnd(labelWidth) +
        providers.map((p) => row.get(reports[p]!.aggregates).padStart(colWidth)).join(''),
    );
  }
  console.log('');
  for (const p of providers) {
    const r = reports[p]!;
    if (!r.baseline) {
      console.log(`[gate] ${p}: no baseline (run npm run eval:baseline)`);
    } else if (r.gate.failures.length === 0) {
      console.log(`[gate] ${p}: PASS`);
    } else {
      console.log(`[gate] ${p}: FAIL`);
      for (const f of r.gate.failures) console.log(`       - ${f}`);
    }
  }
  const evalCost = providers.reduce((s, p) => s + reports[p]!.aggregates.judgeCostUsd, 0);
  console.log(`[eval cost] judge (${meta.judgeModel}): ${usd(evalCost)}`);
}
