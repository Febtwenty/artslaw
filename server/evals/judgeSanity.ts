// Judge sanity check — run after changing JUDGE_MODEL or the judge prompt.
//
//   npm run eval:judge-sanity
//
// Takes a real tour response from the most recent eval results, appends two
// fabrications (a false biographical fact and an invented staging detail),
// and asserts the judge marks neither as `supported`. Exit 0 = pass.
import './config';
import * as fs from 'fs';
import * as path from 'path';
import { JUDGE_MODEL, RESULTS_DIR } from './config';
import { judgeRun } from './judge/judge';
import { costUsd } from './metrics/pricing';

const FABRICATIONS =
  '\n\nThe artist was awarded the Nobel Prize in Literature in 2003 for their memoirs. ' +
  'The final room is painted deep crimson and displays exactly 47 bronze sculptures on marble plinths.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findJudgeableRun(): { record: any; language: 'en' | 'de'; source: string } {
  if (!fs.existsSync(RESULTS_DIR)) {
    throw new Error(`No results yet (${RESULTS_DIR}) — run \`npm run eval -- --no-judge\` first.`);
  }
  const dirs = fs.readdirSync(RESULTS_DIR).sort().reverse();
  for (const dir of dirs) {
    const file = path.join(RESULTS_DIR, dir, 'results.json');
    if (!fs.existsSync(file)) continue;
    const results = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const provider of Object.keys(results.reports ?? {})) {
      for (const run of results.reports[provider].runs ?? []) {
        const rec = run.record;
        if (rec.kind === 'initial-tour' && rec.responseText && rec.evidenceAvailable && !rec.error) {
          return { record: rec, language: 'en', source: `${dir} / ${rec.scenarioId} (${provider})` };
        }
      }
    }
  }
  throw new Error(
    `No judgeable initial-tour run found under ${RESULTS_DIR} — run \`npm run eval -- --no-judge\` first.`,
  );
}

async function main(): Promise<void> {
  const { record, language, source } = findJudgeableRun();
  console.log(`[judge-sanity] model=${JUDGE_MODEL} response from ${source}`);

  record.responseText += FABRICATIONS;
  const outcome = await judgeRun(record, language);
  if (!outcome.verdict) throw new Error(`judge returned no verdict: ${outcome.error}`);

  const flagged = outcome.verdict.claims.filter(
    (c) =>
      c.claim.toLowerCase().includes('nobel') ||
      c.claim.includes('47') ||
      c.claim.toLowerCase().includes('crimson'),
  );
  console.log('[judge-sanity] verdicts on injected fabrications:');
  for (const c of flagged) console.log(`  [${c.verdict}] ${c.claim}`);
  console.log(`[judge-sanity] judge cost: $${costUsd(JUDGE_MODEL, outcome.usage).toFixed(5)}`);

  const pass = flagged.length >= 2 && flagged.every((c) => c.verdict !== 'supported');
  if (!pass) {
    console.error('[judge-sanity] FAIL — fabrications were missed or marked supported');
    process.exit(1);
  }
  console.log('[judge-sanity] PASS — fabrications not marked supported');
}

main().catch((err) => {
  console.error('[judge-sanity] fatal:', err);
  process.exit(1);
});
