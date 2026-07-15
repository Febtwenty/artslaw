import * as path from 'path';
import * as dotenv from 'dotenv';

export const EVALS_DIR = __dirname;
export const REPO_ROOT = path.resolve(EVALS_DIR, '../..');

// Same .env the server uses — keys stay server-side, never in fixtures/results.
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

export const FIXTURES_DIR = path.join(EVALS_DIR, 'fixtures');
export const PAGES_DIR = path.join(FIXTURES_DIR, 'pages');
export const TAVILY_DIR = path.join(FIXTURES_DIR, 'tavily');
export const RESULTS_DIR = path.join(EVALS_DIR, 'results');
export const BASELINE_DIR = path.join(EVALS_DIR, 'baseline');

// Judge — separate from the app models; priced on its own "eval cost" line.
// Sonnet 5 chosen over Opus 4.8 for cost (~40% cheaper); when changing the
// judge model, re-run `npm run eval:judge-sanity` and re-baseline — scores
// aren't comparable across judges.
export const JUDGE_MODEL = 'claude-sonnet-5';
export const JUDGE_MAX_TOKENS = 8000;

// Cap the evidence bundle handed to the judge (page ≤3000 chars, Tavily
// entries ≤1500 chars each — normally well under this).
export const MAX_EVIDENCE_CHARS = 20000;

// Mirror the route's token budgets (chat.ts) so eval runs match production.
export const INITIAL_MAX_TOKENS = 2000;
export const FOLLOWUP_MAX_TOKENS = 1200;
