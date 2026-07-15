import * as fs from 'fs';
import * as path from 'path';
import { tavilySearch, TavilyResult } from '../../src/services/tavily';
import { SearchFn } from '../../src/services/webSearchTool';
import { fetchPageContent } from '../../src/services/pageContent';
import { PAGES_DIR, TAVILY_DIR } from '../config';
import { EvalScenario, EvidenceMode } from '../scenarios/types';

export interface TavilyFixtureEntry {
  recordedQuery: string;
  keywords: string[];
  results: TavilyResult[];
}

export interface TavilyFixture {
  entries: TavilyFixtureEntry[];
}

// Everything a scenario run needs to resolve web evidence, in one of three
// modes. finalize() persists recorded fixtures (no-op outside --record).
export interface ScenarioSearchEnv {
  mode: EvidenceMode;
  searchFn: SearchFn;
  getPage: (url: string) => Promise<string | null>;
  finalize: () => void;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'where', 'when',
  'current', 'currently', 'exhibition', 'exhibitions', 'art', 'artist', 'show',
  'aktuelle', 'kunstausstellung', 'ausstellung', 'ausstellungen', 'kunst',
  '2024', '2025', '2026', '2027',
]);

function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return [...new Set(tokens)].slice(0, 8);
}

function pagePath(scenario: EvalScenario): string {
  return path.join(PAGES_DIR, `${scenario.id}.txt`);
}

function tavilyPath(scenario: EvalScenario): string {
  return path.join(TAVILY_DIR, `${scenario.id}.json`);
}

function loadTavilyFixture(scenario: EvalScenario): TavilyFixture {
  if (scenario.fixtures.tavily === 'empty') return { entries: [] };
  const p = tavilyPath(scenario);
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing Tavily fixture for scenario "${scenario.id}" (${p}). ` +
        `Record it first: npm run eval:record -- --scenario ${scenario.id}`,
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as TavilyFixture;
}

// Scenario-scoped, keyword-matched replay: model-generated queries differ run
// to run, so exact-query keys would never hit. Score each recorded entry by
// keyword overlap with the incoming query and serve the best match, falling
// back to the first entry. An empty fixture always serves [] (the
// WEB_SEARCH_NO_RESULTS_MESSAGE path).
function replaySearch(fixture: TavilyFixture): SearchFn {
  return async (query: string, maxResults?: number) => {
    if (fixture.entries.length === 0) return [];
    const tokens = new Set(extractKeywords(query));
    let best = fixture.entries[0];
    let bestScore = -1;
    for (const entry of fixture.entries) {
      const score = entry.keywords.filter((k) => tokens.has(k)).length;
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    const results = best.results;
    return typeof maxResults === 'number' ? results.slice(0, maxResults) : results;
  };
}

export function createSearchEnv(scenario: EvalScenario, mode: EvidenceMode): ScenarioSearchEnv {
  if (mode === 'replay') {
    return {
      mode,
      searchFn: replaySearch(loadTavilyFixture(scenario)),
      getPage: async () => {
        if (scenario.fixtures.page === null) return null;
        const p = pagePath(scenario);
        if (!fs.existsSync(p)) {
          throw new Error(
            `Missing page fixture for scenario "${scenario.id}" (${p}). ` +
              `Record it first: npm run eval:record -- --scenario ${scenario.id}`,
          );
        }
        return fs.readFileSync(p, 'utf8');
      },
      finalize: () => undefined,
    };
  }

  if (mode === 'live') {
    return {
      mode,
      searchFn: tavilySearch,
      getPage: (url) => (scenario.fixtures.page === null ? Promise.resolve(null) : fetchPageContent(url)),
      finalize: () => undefined,
    };
  }

  // record: run live, capture every (query -> results) pair + the page text.
  const recorded: TavilyFixtureEntry[] = [];
  let recordedPage: string | null | undefined;

  return {
    mode,
    searchFn: async (query: string, maxResults?: number) => {
      const results = await tavilySearch(query, maxResults);
      recorded.push({ recordedQuery: query, keywords: extractKeywords(query), results });
      return results;
    },
    getPage: async (url) => {
      if (scenario.fixtures.page === null) return null;
      recordedPage = await fetchPageContent(url);
      return recordedPage;
    },
    finalize: () => {
      if (scenario.fixtures.tavily !== 'empty') {
        fs.mkdirSync(TAVILY_DIR, { recursive: true });
        // Merge with any existing fixture (recording both providers enriches
        // the entry pool instead of the second run clobbering the first).
        const p = tavilyPath(scenario);
        const existing: TavilyFixture = fs.existsSync(p)
          ? (JSON.parse(fs.readFileSync(p, 'utf8')) as TavilyFixture)
          : { entries: [] };
        const seen = new Set(existing.entries.map((e) => e.recordedQuery));
        for (const entry of recorded) {
          if (!seen.has(entry.recordedQuery)) {
            seen.add(entry.recordedQuery);
            existing.entries.push(entry);
          }
        }
        fs.writeFileSync(p, JSON.stringify(existing, null, 2) + '\n', 'utf8');
      }
      if (typeof recordedPage === 'string') {
        fs.mkdirSync(PAGES_DIR, { recursive: true });
        fs.writeFileSync(pagePath(scenario), recordedPage, 'utf8');
      } else if (recordedPage === null && scenario.fixtures.page === 'auto') {
        throw new Error(
          `Recording scenario "${scenario.id}": page fetch for ${scenario.exhibitionUrl} returned null — ` +
            `pick a reachable exhibition URL or set fixtures.page: null intentionally.`,
        );
      }
    },
  };
}
