# ArtSlaw Evaluation Suite

This folder contains automated quality tests ("evals") for ArtSlaw's two AI features:

- the **tour chat** (`/api/chat`) — where the AI researches an exhibition and guides you through it, and
- the **exhibition discovery** (`/api/exhibition-search`) — where free-text like "exhibitions in Vienna" is turned into clickable exhibition cards.

Unlike normal software tests, you can't check an AI answer with a simple "expected output equals actual output" — the model phrases things differently every time. So instead, this suite measures **qualities** of the answers: Are the facts real? Did the model search the web when it should have? How fast and how expensive was it? And it does this for **both** AI providers (Claude and Mistral) over the exact same test cases, so you can compare them and catch regressions when you change a prompt, a model, or a provider.

Important to know:

- **Evals only run when you start them manually.** The webapp never triggers them; nothing here runs in production.
- The evals call the **real production code** (the same tool loop and prompts the app uses), so results reflect what users actually get.
- Running evals costs real API tokens: a little for the app models (Haiku/Mistral are cheap) and more for the "judge" model that grades the answers. The judge cost is always shown separately on an **eval cost** line.

---

## How it works, step by step

Every eval run does the following for each test case (called a **scenario**):

```
1. EVIDENCE    The harness serves the web evidence — the exhibition page text and
               web search results. By default these come from recorded files
               ("fixtures") instead of the live internet, so every run sees the
               same evidence.

2. RUN         The scenario is played through the real production code: the model
               gets the same prompt a real user request would produce, may call the
               web_search tool, and streams back an answer. The harness records
               everything: the answer, every search the model made, what results it
               got, timing, and token usage.

3. GRADE       Two kinds of grading happen:
               a) Code-based checks (exact, free): did the model search when it
                  should? Is the answer structured correctly? In the right language?
               b) An AI judge (a stronger model, currently claude-sonnet-5) reads
                  the answer, splits it into individual factual claims, and checks
                  each claim against the evidence from step 1. A fact the evidence
                  doesn't contain counts as unsupported — even if it happens to be
                  true in the real world. That's the "groundedness" score.

4. COMPARE     The scores are compared against a saved reference score (the
               "baseline"). If quality dropped beyond the allowed thresholds,
               the run fails with exit code 1 — like a failing test suite.
```

The key trick in step 3b: the judge is **not** asked "is this true?" but "**does the evidence the model was given actually say this?**" That is the failure mode we care about — the model confidently adding plausible-sounding details it never found anywhere.

---

## The test cases (scenarios)

Twelve scenarios live in [`scenarios/scenarios.ts`](scenarios/scenarios.ts). Each one runs against both providers.

### Normal tours — "does a typical tour stay factual?"

| Scenario | What it simulates |
|---|---|
| `tour-emin-en` | User pastes the Tracey Emin exhibition page (Tate Modern) and asks for a tour, in English |
| `tour-mendieta-en` | Ana Mendieta exhibition (Tate Modern), user says they know nothing about the artist |
| `tour-wien1900-de` | German-language tour of "Wien 1900" (Leopold Museum) |
| `tour-albertina250-de` | German-language tour of the Albertina anniversary exhibition |

These check: is every fact in the tour backed by the exhibition page or the search results? Does the answer have the required four sections (opening, The Artist, The Exhibition, What to Look For)? Is it in the requested language?

### Stress tests — "what happens when things go wrong?"

| Scenario | What it simulates |
|---|---|
| `tour-no-page-en` | The exhibition page couldn't be fetched. The model **must** fall back to web search — answering from memory alone would be guessing. |
| `tour-no-evidence-en` | Worst case: no page AND every search comes back empty. Here the *right* answer is honesty ("I couldn't verify information about this exhibition"), not a confident, invented tour. This is scored as **hedging** instead of groundedness. |

### Follow-up questions — "does the model know when (not) to search?"

| Scenario | What it simulates |
|---|---|
| `followup-elaborate-en` | After a tour, the user asks "summarize that in three sentences". Everything needed is already in the conversation — searching here is a mistake (wasted time and money). |
| `followup-newartist-en` | The user asks about a *different* artist (Marina Abramović). Now the model **must** search — it has no evidence about her. |
| `followup-elaborate-de` | Same as the first, in German. |

### Discovery — "are the exhibition cards real?"

| Scenario | What it simulates |
|---|---|
| `discovery-vienna-en` | "exhibitions in Vienna" — should produce at least one valid exhibition card |
| `discovery-berlin-de` | "Ausstellungen in Berlin" — same, in German |
| `discovery-nonsense-en` | Gibberish input ("asdkfjh qwerzxcv…") — should produce **zero** cards, not invented ones |

Discovery has a hard safety rule in production: a card's URL must appear **verbatim** in the actual search results, otherwise it's thrown away. The eval measures how often the model proposes URLs that get thrown away (the **hallucinated-URL rate**) — a direct measure of how much the model invents.

---

## What the numbers in the report mean

| Metric | Question it answers | Good looks like |
|---|---|---|
| Groundedness | What share of factual claims is actually backed by the evidence? | High (90%+) |
| Contradiction rate | How often does the answer *contradict* the evidence? | ~0% |
| Hedging pass rate | With no evidence at all, does the model admit that instead of inventing a tour? | High |
| Tool-call accuracy | Did the model search exactly when the scenario required (and not when it shouldn't)? | 100% |
| Tool-args validity | Were the search queries well-formed? | 100% |
| Loop termination | Did the model finish within the allowed number of search rounds? | ~100% |
| Source-integrity violations | Did the app ever show a source link that didn't come from a real search result? | 0 |
| Discovery parse rate | Did the discovery AI return machine-readable output every time? | 100% |
| Hallucinated-URL rate | Share of proposed exhibition cards with made-up URLs (caught by the filter) | Low |
| Structure / language rate | Four tour sections present? Correct language (en/de)? | High |
| Latency p50 / p95, TTFT p50 | How fast are answers, typically and at worst? How long until the first word appears? | Low |
| Cost per tour | Average API cost of one tour answer, per provider | Low |
| Eval cost | What the judge itself cost for this run — bookkeeping, never mixed into app cost | (informational) |

Some checks are graded twice — once by code (regex/heuristics) and once by the judge. When they agree, you can trust the number; the code-based version is the one that gates.

---

## Running the evals

All commands run from the `server/` folder. **Note the `--` before custom flags** — npm needs it to pass flags through to the script.

```bash
npm run eval                              # the standard run: recorded evidence, both providers, judged, gated
npm run eval -- --provider mistral        # one provider only (faster, cheaper)
npm run eval -- --repeat 3                # 3 runs per scenario — less noisy, use for real decisions
npm run eval -- --scenario tour-emin-en   # a single scenario
npm run eval -- --no-judge                # code-based checks only: fast and free, no groundedness
npm run eval -- --no-gate                 # exploratory run that never fails the exit code

npm run eval:live                         # use the live internet instead of recorded evidence
npm run eval:record                       # live run that (re)records the evidence fixtures
npm run eval:baseline                     # replay ×3 and save the result as the new reference baseline
npm run eval:judge-sanity                 # quick self-test of the judge (see below)
npm run eval:typecheck                    # compile-check the eval code
```

A full judged run takes ~5–10 minutes and prints a side-by-side Claude/Mistral table. Detailed results land in `results/<timestamp>/` (not committed to git): `report.md` is the human-readable report including every unsupported claim with the evidence quote; `results.json` has the raw data.

### The everyday workflow: improving a prompt

1. Edit the system prompt in `src/prompts.ts`.
2. `npm run eval -- --repeat 3` — compare the scores against the baseline. The gate only fails on *drops*, so improvements always pass.
3. Happy with the change? Commit the prompt, then run `npm run eval:baseline` and commit the updated `baseline/*.json` files — this locks in the improvement so future changes are measured against the new, higher bar.

### When to re-record fixtures

The recorded evidence doesn't go stale on its own — replay runs keep working even after an exhibition closes. Re-record (`npm run eval:record`, optionally `-- --scenario <id>`) only when you *want* fresher content, when you add/change a scenario, or when a live/record run reports a dead page URL. **After re-recording, always re-baseline** — scores against different evidence aren't comparable.

### When you change the judge

The judge model is set in [`config.ts`](config.ts) (`JUDGE_MODEL`). After changing it: run `npm run eval:judge-sanity` — it takes a real tour answer, secretly appends two fabricated facts, and verifies the judge catches them. Then re-baseline: different judges draw the supported/unsupported line slightly differently, so old and new scores must not be mixed.

---

## Folder map

```
evals/
├── run.ts                  # the command-line entry point
├── config.ts               # judge model, token budgets, paths
├── scenarios/              # the 12 test cases
├── fixtures/               # recorded web evidence (committed to git)
│   ├── pages/              #   exhibition page text, one .txt per scenario
│   └── tavily/             #   recorded search results, one .json per scenario
├── harness/                # runs a scenario through the production code
├── judge/                  # the AI judge: prompt, output schema, API call
├── metrics/                # scoring math + the price table (⚠ Mistral price is a TODO placeholder)
├── report/                 # console table, report.md, results.json writers
├── baseline/               # saved reference scores + the gate thresholds
├── judgeSanity.ts          # fabricated-claim self-test for the judge
└── results/                # run outputs (gitignored)
```

Guardrails honored throughout: search goes through Tavily only (never a provider's built-in web search), the harness never writes to MongoDB, API keys come from the repo-root `.env` and stay server-side, and the eval code is excluded from the production build.

---

## Eval glossary

**Eval (evaluation)** — An automated test for AI output quality. Because AI answers vary between runs, evals measure *qualities* (factuality, speed, cost) rather than comparing against one fixed expected answer.

**Scenario** — One test case: a simulated user request plus expectations about the answer (e.g. "the model must use web search here").

**LLM-as-judge** — Using a strong language model to grade another model's answer. Used here because "is this claim backed by that text?" requires reading comprehension no regex can do. The judge is given strict rules and a fixed output format to keep grading consistent.

**Groundedness** — The share of factual claims in an answer that are actually supported by the source material the model was given. The core metric of this suite. The opposite failure is a **hallucination**: a confident, plausible-sounding statement the model made up.

**Claim** — One atomic, checkable factual statement extracted from an answer ("Emin was born in 1963", "the show spans four decades"). The judge grades each claim separately as *supported*, *unsupported*, or *contradicted* by the evidence.

**Evidence** — Everything the model had to work with when answering: the fetched exhibition page text plus the web search results it received. Groundedness is judged against this — not against general world knowledge.

**Hedging** — Honestly flagging missing information ("the available information doesn't specify…") instead of filling the gap with a guess. In no-evidence scenarios, hedging is the *correct* behavior and is scored as a pass.

**Fixture** — A saved snapshot of web evidence (a page's text, a set of search results) stored as a file and committed to git.

**Record / replay** — *Record*: run against the live internet and save the evidence as fixtures. *Replay* (the default): serve the saved fixtures instead of touching the internet. Replay makes runs repeatable and immune to the web changing underneath you.

**Deterministic check** — A grade computed by plain code (a regex, a comparison) that gives the same result every time — as opposed to judge-based grades, which cost money and can vary slightly.

**Baseline** — A saved set of reference scores representing "how good the system was at a known-good point". New runs are compared against it. Regenerated deliberately via `npm run eval:baseline` whenever a change is accepted.

**Regression** — A quality drop compared to the baseline: lower groundedness, more contradictions, slower or costlier answers.

**Gate / threshold** — The pass/fail rule. A *threshold* is the allowed amount of change (e.g. "groundedness may not drop more than 5 points"); the *gate* checks all thresholds and makes the run exit with an error code if any is violated — so a script or CI pipeline can block a bad change.

**Tool call** — The model deciding mid-answer to invoke a capability — here, the `web_search` tool. Tool-call accuracy measures whether the model makes that decision at the right moments.

**Token** — The billing and measurement unit of language models (roughly ¾ of a word). API cost = input tokens + output tokens, each at a per-million price.

**Latency / TTFT / p50 / p95** — *Latency*: total time for an answer. *TTFT* ("time to first token"): how long until the first word appears — what a user perceives as responsiveness. *p50/p95*: percentiles — p50 is the typical case (half the runs were faster), p95 is close to worst-case (95% were faster).

**Structured outputs** — An API feature that forces a model's reply into an exact machine-readable format (JSON with fixed fields). Used for the judge so its verdicts can be processed reliably.

**Repeat** — Running every scenario N times. Because model output varies, single runs are noisy; averaging over 3 runs gives trustworthy numbers. Baselines are always built with repeat 3.
