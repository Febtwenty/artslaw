import { CHAT_MODEL, MISTRAL_CHAT_MODEL } from '../../src/services/chatRunner';
import { EvalScenario, Provider } from '../scenarios/types';
import { RunRecord } from '../harness/scenarioRunner';
import { JudgeOutcome } from '../judge/judge';
import { costUsd } from './pricing';

// ---------------------------------------------------------------------------
// Deterministic per-run checks
// ---------------------------------------------------------------------------

// Models render the prompt's `**Header**` sections either as bold text or as
// markdown headings (`## Header`) — accept both.
const SECTION_HEADERS = {
  en: [/(\*\*|#)\s*The Artist/i, /(\*\*|#)\s*The Exhibition/i, /(\*\*|#)\s*What to Look For/i],
  de: [/(\*\*|#)\s*(Der|Die) K(ü|ue)nstler/i, /(\*\*|#)\s*Die Ausstellung/i, /(\*\*|#)\s*Worauf man achten sollte/i],
};

export function hasRequiredStructure(text: string, lang: 'en' | 'de'): boolean {
  const headers = SECTION_HEADERS[lang];
  if (!headers.every((re) => re.test(text))) return false;
  // Opening: some prose before the first section header.
  const firstHeader = text.search(headers[0]);
  return firstHeader > 20;
}

const DE_FUNCTION_WORDS = ['der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'von', 'im', 'den', 'ein', 'eine', 'nicht', 'auch', 'sich', 'werden', 'auf', 'sie'];
const EN_FUNCTION_WORDS = ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'with', 'for', 'this', 'are', 'was', 'on', 'it', 'you', 'what'];

export function detectLanguageMatch(text: string, lang: 'en' | 'de'): boolean {
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const score = (words: string[]) => words.reduce((s, w) => s + (counts.get(w) ?? 0), 0);
  const de = score(DE_FUNCTION_WORDS);
  const en = score(EN_FUNCTION_WORDS);
  return lang === 'de' ? de > en : en > de;
}

export interface RunChecks {
  toolCallExpectationMet: boolean | null; // null = not scored ('either' or discovery)
  structureOk: boolean | null;
  languageOk: boolean | null;
  sourceIntegrityOk: boolean | null;
  loopTerminated: boolean | null;
  hedgingPass: boolean | null; // hedging-track runs only
  discoveryExpectationMet: boolean | null;
}

export interface ScoredRun {
  record: RunRecord;
  judge: JudgeOutcome | null;
  checks: RunChecks;
  appCostUsd: number;
}

export function scoreRun(scenario: EvalScenario, record: RunRecord, judge: JudgeOutcome | null): ScoredRun {
  const checks: RunChecks = {
    toolCallExpectationMet: null,
    structureOk: null,
    languageOk: null,
    sourceIntegrityOk: null,
    loopTerminated: null,
    hedgingPass: null,
    discoveryExpectationMet: null,
  };

  if (record.error) {
    return {
      record,
      judge,
      checks,
      appCostUsd: 0,
    };
  }

  if (record.kind === 'discovery') {
    const d = record.discovery!;
    const { minValidatedCandidates, maxValidatedCandidates } = scenario.expect;
    let met: boolean | null = null;
    if (minValidatedCandidates !== undefined || maxValidatedCandidates !== undefined) {
      met =
        (minValidatedCandidates === undefined || d.validatedCount >= minValidatedCandidates) &&
        (maxValidatedCandidates === undefined || d.validatedCount <= maxValidatedCandidates);
    }
    checks.discoveryExpectationMet = met;
  } else {
    const toolCalls = record.toolCalls ?? [];
    if (scenario.expect.toolCall !== 'either') {
      checks.toolCallExpectationMet = (toolCalls.length > 0) === scenario.expect.toolCall;
    }
    if (scenario.expect.structure) {
      checks.structureOk = hasRequiredStructure(record.responseText ?? '', scenario.language);
    }
    checks.languageOk = detectLanguageMatch(record.responseText ?? '', scenario.language);
    checks.loopTerminated = !record.stoppedAtIterationCap;

    // Every emitted source URL must come from a Tavily result actually served.
    const served = new Set(toolCalls.flatMap((c) => c.servedSourceUrls));
    checks.sourceIntegrityOk = (record.sources ?? []).every((s) => served.has(s.url));

    if (scenario.expect.hedging && record.evidenceAvailable === false && judge?.verdict) {
      const unsupported = judge.verdict.claims.filter((c) => c.verdict === 'unsupported').length;
      checks.hedgingPass = judge.verdict.acknowledges_missing_info && unsupported <= 1;
    }
  }

  const model = record.provider === 'claude' ? CHAT_MODEL : MISTRAL_CHAT_MODEL;
  return {
    record,
    judge,
    checks,
    appCostUsd: costUsd(model, record.usage),
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface Aggregates {
  provider: Provider;
  runs: number;
  errors: number;
  // Judge-based (evidence-available chat runs, hedging-track excluded)
  groundedness: number | null;
  contradictionRate: number | null;
  totalClaims: number;
  hedgingPassRate: number | null;
  // Deterministic
  toolCallAccuracy: number | null;
  toolArgsValidity: number | null;
  loopTerminationRate: number | null;
  sourceIntegrityViolations: number;
  discoveryParseRate: number | null;
  hallucinatedUrlRate: number | null;
  discoveryExpectationRate: number | null;
  structureRate: number | null;
  languageMatchRate: number | null;
  // Judge cross-checks (reported, not gated)
  judgeStructureRate: number | null;
  judgeLanguageRate: number | null;
  // Latency / cost
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  ttftP50Ms: number | null;
  costPerTourUsd: number | null;
  totalAppCostUsd: number;
  judgeCostUsd: number;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function rate(passed: number, total: number): number | null {
  return total === 0 ? null : passed / total;
}

function rateOf(values: (boolean | null)[]): number | null {
  const scored = values.filter((v): v is boolean => v !== null);
  return rate(scored.filter(Boolean).length, scored.length);
}

export function aggregate(provider: Provider, runs: ScoredRun[], judgeCostUsd: number): Aggregates {
  const ok = runs.filter((r) => !r.record.error);
  const chat = ok.filter((r) => r.record.kind !== 'discovery');
  const discovery = ok.filter((r) => r.record.kind === 'discovery');

  // Groundedness over evidence-available, non-hedging chat runs with a verdict
  const groundednessRuns = chat.filter(
    (r) => r.record.evidenceAvailable && r.checks.hedgingPass === null && r.judge?.verdict,
  );
  let supported = 0;
  let contradicted = 0;
  let totalClaims = 0;
  for (const r of groundednessRuns) {
    for (const claim of r.judge!.verdict!.claims) {
      totalClaims++;
      if (claim.verdict === 'supported') supported++;
      if (claim.verdict === 'contradicted') contradicted++;
    }
  }

  const allToolCalls = chat.flatMap((r) => r.record.toolCalls ?? []);

  const proposed = discovery.reduce((s, r) => s + r.record.discovery!.proposedCount, 0);
  const validated = discovery.reduce((s, r) => s + r.record.discovery!.validatedCount, 0);

  const judged = chat.filter((r) => r.judge?.verdict);

  const latencies = ok.map((r) => r.record.latencyMs);
  const ttfts = chat.map((r) => r.record.ttftMs).filter((t): t is number => t !== null);
  const tourCosts = chat.map((r) => r.appCostUsd);

  return {
    provider,
    runs: runs.length,
    errors: runs.length - ok.length,
    groundedness: rate(supported, totalClaims),
    contradictionRate: rate(contradicted, totalClaims),
    totalClaims,
    hedgingPassRate: rateOf(chat.map((r) => r.checks.hedgingPass)),
    toolCallAccuracy: rateOf(chat.map((r) => r.checks.toolCallExpectationMet)),
    toolArgsValidity: rate(allToolCalls.filter((c) => c.argsValid).length, allToolCalls.length),
    loopTerminationRate: rateOf(chat.map((r) => r.checks.loopTerminated)),
    sourceIntegrityViolations: chat.filter((r) => r.checks.sourceIntegrityOk === false).length,
    discoveryParseRate: rate(discovery.filter((r) => r.record.discovery!.parseOk).length, discovery.length),
    hallucinatedUrlRate: proposed === 0 ? null : (proposed - validated) / proposed,
    discoveryExpectationRate: rateOf(discovery.map((r) => r.checks.discoveryExpectationMet)),
    structureRate: rateOf(chat.map((r) => r.checks.structureOk)),
    languageMatchRate: rateOf(chat.map((r) => r.checks.languageOk)),
    judgeStructureRate: (() => {
      const judgedTours = judged.filter((r) => r.record.kind === 'initial-tour');
      return rate(
        judgedTours.filter((r) => {
          const s = r.judge!.verdict!.sections_present;
          return s.opening && s.artist && s.exhibition && s.what_to_look_for;
        }).length,
        judgedTours.length,
      );
    })(),
    judgeLanguageRate: rate(judged.filter((r) => r.judge!.verdict!.language_matches).length, judged.length),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    ttftP50Ms: percentile(ttfts, 50),
    costPerTourUsd: tourCosts.length === 0 ? null : tourCosts.reduce((a, b) => a + b, 0) / tourCosts.length,
    totalAppCostUsd: ok.reduce((s, r) => s + r.appCostUsd, 0),
    judgeCostUsd,
  };
}
