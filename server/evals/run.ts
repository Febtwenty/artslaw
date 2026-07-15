// ArtSlaw offline eval runner.
//
//   npm run eval                     # replay fixtures, both providers, judge, gate
//   npm run eval:live                # real Tavily + page fetches (not gated on latency/cost)
//   npm run eval:record              # live + write fixtures
//   npm run eval:baseline            # replay ×3, write baseline JSONs
//
// Flags: --provider claude|mistral|both  --scenario <id> (repeatable)
//        --repeat N  --live  --record  --write-baseline  --no-gate  --no-judge
import * as fs from 'fs';
import * as path from 'path';
import './config'; // dotenv first
import { BASELINE_DIR, JUDGE_MODEL } from './config';
import { CHAT_MODEL, MISTRAL_CHAT_MODEL } from '../src/services/chatRunner';
import { SCENARIOS } from './scenarios/scenarios';
import { EvalScenario, EvidenceMode, Provider } from './scenarios/types';
import { runScenario, RunRecord } from './harness/scenarioRunner';
import { judgeRun, JudgeOutcome } from './judge/judge';
import { aggregate, scoreRun, ScoredRun } from './metrics/metrics';
import { costUsd } from './metrics/pricing';
import { Baseline, gate } from './baseline/thresholds';
import { getGitSha, printConsole, ProviderReport, RunMeta, writeResults } from './report/report';

interface CliArgs {
  providers: Provider[];
  scenarioIds: string[];
  repeat: number;
  mode: EvidenceMode;
  writeBaseline: boolean;
  noGate: boolean;
  noJudge: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    providers: ['claude', 'mistral'],
    scenarioIds: [],
    repeat: 1,
    mode: 'replay',
    writeBaseline: false,
    noGate: false,
    noJudge: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--provider': {
        const v = argv[++i];
        if (v === 'both') args.providers = ['claude', 'mistral'];
        else if (v === 'claude' || v === 'mistral') args.providers = [v];
        else throw new Error(`--provider must be claude|mistral|both, got "${v}"`);
        break;
      }
      case '--scenario':
        args.scenarioIds.push(argv[++i]);
        break;
      case '--repeat':
        args.repeat = Math.max(1, parseInt(argv[++i], 10) || 1);
        break;
      case '--live':
        if (args.mode === 'replay') args.mode = 'live';
        break;
      case '--record':
        args.mode = 'record';
        break;
      case '--write-baseline':
        args.writeBaseline = true;
        break;
      case '--no-gate':
        args.noGate = true;
        break;
      case '--no-judge':
        args.noJudge = true;
        break;
      default:
        throw new Error(`Unknown flag "${a}"`);
    }
  }
  return args;
}

function baselinePath(provider: Provider): string {
  return path.join(BASELINE_DIR, `${provider}.baseline.json`);
}

function loadBaseline(provider: Provider): Baseline | null {
  const p = baselinePath(provider);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Baseline;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let scenarios: EvalScenario[] = SCENARIOS;
  if (args.scenarioIds.length > 0) {
    scenarios = SCENARIOS.filter((s) => args.scenarioIds.includes(s.id));
    const missing = args.scenarioIds.filter((id) => !scenarios.some((s) => s.id === id));
    if (missing.length > 0) throw new Error(`Unknown scenario id(s): ${missing.join(', ')}`);
  }

  const meta: RunMeta = {
    mode: args.mode,
    repeat: args.repeat,
    providers: args.providers,
    startedAt: new Date().toISOString(),
    gitSha: getGitSha(),
    chatModels: { claude: CHAT_MODEL, mistral: MISTRAL_CHAT_MODEL },
    judgeModel: JUDGE_MODEL,
  };

  console.log(
    `[eval] mode=${args.mode} providers=${args.providers.join(',')} scenarios=${scenarios.length} repeat=${args.repeat} judge=${args.noJudge ? 'off' : JUDGE_MODEL}`,
  );

  const reports: Partial<Record<Provider, ProviderReport>> = {};
  let anyGateFailure = false;

  for (const provider of args.providers) {
    // Sequential scenario runs keep latency measurements clean.
    const records: RunRecord[] = [];
    for (const scenario of scenarios) {
      for (let r = 0; r < args.repeat; r++) {
        process.stdout.write(`[run] ${provider} ${scenario.id}${args.repeat > 1 ? ` #${r + 1}` : ''} ... `);
        const record = await runScenario(scenario, provider, args.mode, r);
        console.log(record.error ? `ERROR (${record.error.slice(0, 80)})` : `${record.latencyMs}ms`);
        records.push(record);
      }
    }

    // Judge chat responses (parallel, bounded).
    const scenarioById = new Map(scenarios.map((s) => [s.id, s]));
    let judgeOutcomes: (JudgeOutcome | null)[];
    if (args.noJudge) {
      judgeOutcomes = records.map(() => null);
    } else {
      console.log(`[judge] ${provider}: judging ${records.filter((r) => r.kind !== 'discovery' && !r.error).length} chat response(s) ...`);
      judgeOutcomes = await mapLimit(records, 4, async (record) => {
        const scenario = scenarioById.get(record.scenarioId)!;
        return judgeRun(record, scenario.language);
      });
      for (let i = 0; i < records.length; i++) {
        const outcome = judgeOutcomes[i];
        if (outcome?.error) console.warn(`[judge] ${records[i].scenarioId}: ${outcome.error}`);
      }
    }

    const scored: ScoredRun[] = records.map((record, i) =>
      scoreRun(scenarioById.get(record.scenarioId)!, record, judgeOutcomes[i]),
    );

    const judgeCost = judgeOutcomes.reduce(
      (s, o) => s + (o ? costUsd(JUDGE_MODEL, o.usage) : 0),
      0,
    );
    const aggregates = aggregate(provider, scored, judgeCost);
    const baseline = loadBaseline(provider);
    const gateResult =
      args.noGate || args.writeBaseline
        ? { failures: [] }
        : gate(aggregates, baseline, args.mode === 'replay');
    if (gateResult.failures.length > 0) anyGateFailure = true;

    reports[provider] = { aggregates, baseline, gate: gateResult, runs: scored };

    if (args.writeBaseline) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      const newBaseline: Baseline = {
        provider,
        chatModel: provider === 'claude' ? CHAT_MODEL : MISTRAL_CHAT_MODEL,
        createdAt: meta.startedAt,
        repeat: args.repeat,
        mode: args.mode,
        aggregates,
      };
      fs.writeFileSync(baselinePath(provider), JSON.stringify(newBaseline, null, 2) + '\n', 'utf8');
      console.log(`[baseline] wrote ${baselinePath(provider)}`);
    }
  }

  const { dir } = writeResults(meta, scenarios, reports);
  printConsole(meta, reports);
  console.log(`\n[results] ${dir}`);

  if (anyGateFailure) {
    console.error('\n[eval] GATE FAILED — see failures above (use --no-gate for exploratory runs)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
