import { getAnthropicClient, getMistralClient } from './llmClients';
import { tavilySearch, TavilyResult } from './tavily';
import { SearchFn } from './webSearchTool';
import {
  buildDiscoveryExtractionSystemPrompt,
  buildDiscoveryExtractionUserMessage,
} from '../prompts';

export const DISCOVERY_MODEL = 'claude-haiku-4-5';
export const DISCOVERY_MISTRAL_MODEL = 'mistral-small-latest';
// Extraction returns at most 4 small JSON objects — no need for a large budget
const MAX_TOKENS = 600;
const MAX_CANDIDATES = 4;
const MAX_SNIPPET_LENGTH = 200;

export interface ExhibitionCandidate {
  title: string;
  artist?: string;
  venue?: string;
  url: string;
  snippet?: string;
}

export interface DiscoveryDeps {
  // Defaults to real Tavily; the eval harness injects a fixture-replay stub.
  searchFn?: SearchFn;
}

export interface DiscoveryResult {
  candidates: ExhibitionCandidate[];
  // Raw Tavily results the extraction saw — the harness's evidence bundle.
  tavilyResults: TavilyResult[];
  tavilyQuery: string;
  // False only when the LLM output could not be parsed as JSON.
  parseOk: boolean;
  rawText: string;
  // How many candidates the model proposed vs how many survived the
  // verbatim-URL anti-hallucination filter.
  proposedCount: number;
  validatedCount: number;
  usage: { inputTokens: number; outputTokens: number };
}

function normalizeUrlForDedupe(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

// Last-resort recovery when the model surrounds the JSON array with prose
// (observed with empty results: "[] ...explanation" or "explanation... []").
// Returns the first balanced top-level JSON array in the text, or null.
function extractFirstJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Keep only candidates whose URL is verbatim one of the Tavily result URLs —
// hard guarantee the model cannot send users to a hallucinated link.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateCandidates(parsed: any, sourceUrls: string[]): ExhibitionCandidate[] {
  if (!Array.isArray(parsed)) return [];
  const allowed = new Map(sourceUrls.map((u) => [normalizeUrlForDedupe(u), u]));
  const seen = new Set<string>();
  const candidates: ExhibitionCandidate[] = [];
  for (const item of parsed) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const rawUrl = typeof item.url === 'string' ? item.url.trim() : '';
    if (!title || !rawUrl) continue;
    const key = normalizeUrlForDedupe(rawUrl);
    const sourceUrl = allowed.get(key);
    if (!sourceUrl || seen.has(key)) continue;
    try {
      const protocol = new URL(sourceUrl).protocol;
      if (protocol !== 'http:' && protocol !== 'https:') continue;
    } catch {
      continue;
    }
    seen.add(key);
    candidates.push({
      title,
      url: sourceUrl,
      ...(typeof item.artist === 'string' && item.artist.trim() ? { artist: item.artist.trim() } : {}),
      ...(typeof item.venue === 'string' && item.venue.trim() ? { venue: item.venue.trim() } : {}),
      ...(typeof item.snippet === 'string' && item.snippet.trim()
        ? { snippet: item.snippet.trim().slice(0, MAX_SNIPPET_LENGTH) }
        : {}),
    });
  }
  return candidates;
}

export async function runDiscovery(
  query: string,
  lang: 'en' | 'de',
  provider: 'claude' | 'mistral',
  deps: DiscoveryDeps = {},
): Promise<DiscoveryResult> {
  const searchFn = deps.searchFn ?? tavilySearch;

  const year = new Date().getFullYear();
  const tavilyQuery =
    lang === 'de'
      ? `${query} aktuelle Kunstausstellung ${year}`
      : `${query} current art exhibition ${year}`;
  // 8 results (vs the default 5) so the extraction has enough to filter
  // after the location constraint drops mismatched venues
  const results = await searchFn(tavilyQuery, 8);
  if (results.length === 0) {
    // No search results (or Tavily failed) — nothing to extract, no LLM cost
    return {
      candidates: [],
      tavilyResults: [],
      tavilyQuery,
      parseOk: true,
      rawText: '',
      proposedCount: 0,
      validatedCount: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const systemPrompt = buildDiscoveryExtractionSystemPrompt(lang);
  const userMessage = buildDiscoveryExtractionUserMessage({ query, results });

  let rawText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === 'claude') {
    const response = await getAnthropicClient().messages.create({
      model: DISCOVERY_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content[0];
    rawText = block && block.type === 'text' ? block.text : '';
    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;
  } else {
    const client = await getMistralClient();
    const response = await client.chat.complete({
      model: DISCOVERY_MISTRAL_MODEL,
      maxTokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    rawText = typeof content === 'string' ? content : '';
    inputTokens = response.usage?.promptTokens ?? 0;
    outputTokens = response.usage?.completionTokens ?? 0;
  }

  // Models occasionally wrap JSON in markdown fences despite instructions —
  // sometimes with explanatory prose AFTER the closing fence, so take the
  // content of the first fenced block when one exists.
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/i);
  const stripped = fenced
    ? fenced[1].trim()
    : trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const recovered = extractFirstJsonArray(stripped);
    try {
      if (recovered === null) throw new Error('no JSON array found');
      parsed = JSON.parse(recovered);
    } catch {
      return {
        candidates: [],
        tavilyResults: results,
        tavilyQuery,
        parseOk: false,
        rawText,
        proposedCount: 0,
        validatedCount: 0,
        usage: { inputTokens, outputTokens },
      };
    }
  }

  const proposedCount = Array.isArray(parsed) ? parsed.length : 0;
  const candidates = validateCandidates(parsed, results.map((r) => r.url));

  return {
    candidates,
    tavilyResults: results,
    tavilyQuery,
    parseOk: true,
    rawText,
    proposedCount,
    validatedCount: candidates.length,
    usage: { inputTokens, outputTokens },
  };
}
