# ArtSlaw Evaluation Suite

Offline evals for the tour chat (`/api/chat`) and free-text discovery (`/api/exhibition-search`) pipelines. The harness bypasses Express/Clerk/Mongo and calls the **production code** directly — `runClaudeChat` / `runMistralChat` (`src/services/chatRunner.ts`) and `runDiscovery` (`src/services/discovery.ts`) — so eval results reflect the real tool loop, prompts, and parsing.

"Offline" means **no web flakiness**: Tavily results and exhibition page text are replayed from checked-in fixtures by default. LLM API keys (`ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`) are still required — the models run for real. Model outputs are non-deterministic even with fixed evidence; fixtures stabilize only the evidence side, which is why gate thresholds are deliberately loose.

## What is measured

| Metric | How |
|---|---|
| **Groundedness** | LLM judge (`JUDGE_MODEL` in `config.ts`, currently `claude-sonnet-5`, structured outputs) extracts every factual claim from a tour response and verdicts it `supported` / `unsupported` / `contradicted` **against the exact evidence the model saw** (page text + Tavily results served that run). Judge world-knowledge doesn't count as support. When changing the judge model: run `npm run eval:judge-sanity` (injects fabrications into a real response and asserts they aren't marked supported), then re-baseline — scores aren't comparable across judges. |
| **Hedging** | No-evidence scenarios are scored on honesty instead: pass = the response acknowledges missing info and makes ≤1 unsupported claim. Harness-side branch (`evidenceAvailable`), not judge inference. |
| **Tool-call accuracy** | Deterministic: did the model call `web_search` when the scenario requires it (and not when it shouldn't); are args valid non-empty queries; does the loop terminate within `MAX_TOOL_ITERATIONS`; are emitted sources ⊆ actually-served Tavily URLs. |
| **Discovery quality** | JSON parse rate, hallucinated-URL rate (candidates rejected by the verbatim-URL filter / proposed), candidate-count expectations. |
| **Structure & language** | Regex check for the 4 tour sections + language heuristic; cross-checked by judge booleans (regex/heuristic is authoritative for gating). |
| **Latency & cost** | Wall-clock and TTFT per run (p50/p95), tokens × price table (`metrics/pricing.ts`). Judge cost is reported on its own **eval cost** line, never mixed into app cost. |
| **Provider regression** | The whole suite runs per provider (claude, mistral) over identical scenarios; results are compared against checked-in per-provider baselines with thresholds (`baseline/thresholds.ts`). |

## Commands (from `server/`)

```bash
npm run eval                                   # replay fixtures, both providers, judge, gate
npm run eval -- --provider claude              # one provider
npm run eval -- --scenario tour-emin-en        # one scenario (repeatable flag)
npm run eval -- --no-judge --no-gate           # cheap deterministic-only run
npm run eval:live                              # real Tavily + page fetches (latency/cost not gated)
npm run eval:record                            # live run that (re)writes fixtures
npm run eval:baseline                          # replay ×3, writes baseline/<provider>.baseline.json
npm run eval:judge-sanity                      # fabricated-claim check — run after changing the judge
npm run eval:typecheck                         # tsc over the eval tree (excluded from prod build)
```

Exit code is non-zero when any gate threshold fails (`--no-gate` for exploratory runs). Output lands in `results/<timestamp>/` (gitignored): `results.json` (full per-claim verdicts with evidence quotes) and `report.md` (side-by-side provider tables, baseline deltas, worst offenders).

## Fixtures (record/replay)

- `fixtures/pages/<scenarioId>.txt` — the extracted page text `fetchPageContent` would return.
- `fixtures/tavily/<scenarioId>.json` — recorded `(query → results)` entries. Replay is **scenario-scoped and keyword-matched**, not exact-query-keyed: models phrase queries differently every run, so the stub serves the recorded entry with the best keyword overlap (falling back to the first). Recording merges into existing fixtures rather than overwriting.
- `fixtures.tavily: 'empty'` in a scenario means the stub always returns no results (exercises `WEB_SEARCH_NO_RESULTS_MESSAGE` / hedging); `fixtures.page: null` simulates a failed page fetch.

Refresh fixtures when exhibitions close or pages change: `npm run eval:record` (optionally `-- --scenario <id>`). Re-baseline afterwards — recorded evidence changed, so scores aren't comparable to the old baseline.

## Baselines & thresholds

`baseline/<provider>.baseline.json` is checked into git and regenerated **only** via `npm run eval:baseline` (a deliberate, review-able act). Gate rules (`baseline/thresholds.ts`): groundedness may not drop >5 pts, contradiction rate rise >3 pts, tool-call accuracy drop >10 pts; discovery parse rate must be 100% and source-integrity violations 0 (absolute); latency p95 and cost/tour may not regress >25% (replay mode only, where evidence latency is constant).

## Scenario dataset

12 scenarios in `scenarios/scenarios.ts`: 4 initial tours (2 en / 2 de, real exhibition pages), 2 edge cases (page fetch fails → must search; no evidence at all → must hedge), 3 follow-ups (elaborate → must NOT search; new artist → must search; German), 3 discovery queries (en, de, nonsense → must return 0 candidates).

When adding a scenario: add it to `scenarios.ts`, record its fixtures (`npm run eval:record -- --scenario <id>`), sanity-check one replay run, then re-baseline.

## Constraints honored

- Search goes through Tavily only — no provider-native web-search tools anywhere in the harness.
- No Mongo writes; keys are read from the repo-root `.env` server-side only.
- The eval tree is excluded from the production build (`server/tsconfig.json` includes only `src/**`).
