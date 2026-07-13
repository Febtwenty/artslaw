import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../db/usage';
import { checkUsageLimits } from '../middleware/checkUsageLimits';
import { tavilySearch } from '../services/tavily';
import {
  buildDiscoveryExtractionSystemPrompt,
  buildDiscoveryExtractionUserMessage,
} from '../prompts';

const router = Router();

// Instantiated lazily so dotenv in index.ts has time to populate process.env
// before the Anthropic client reads ANTHROPIC_API_KEY.
let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// @mistralai/mistralai v2 is ESM-only; use dynamic import to avoid
// top-level import errors in a CommonJS-compiled TypeScript module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mistral: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMistralClient(): Promise<any> {
  if (!_mistral) {
    const { Mistral } = await import('@mistralai/mistralai');
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

const MODEL = 'claude-haiku-4-5';
const MISTRAL_MODEL = 'mistral-small-latest';
// Extraction returns at most 4 small JSON objects — no need for a large budget
const MAX_TOKENS = 600;
const MAX_QUERY_LENGTH = 200;
const MAX_CANDIDATES = 4;
const MAX_SNIPPET_LENGTH = 200;

interface ExhibitionSearchRequestBody {
  query?: string;
  language?: 'en' | 'de';
  provider?: 'claude' | 'mistral';
}

export interface ExhibitionCandidate {
  title: string;
  artist?: string;
  venue?: string;
  url: string;
  snippet?: string;
}

function normalizeUrlForDedupe(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

// Keep only candidates whose URL is verbatim one of the Tavily result URLs —
// hard guarantee the model cannot send users to a hallucinated link.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateCandidates(parsed: any, sourceUrls: string[]): ExhibitionCandidate[] {
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

router.post('/', checkUsageLimits, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = req.body as ExhibitionSearchRequestBody;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > MAX_QUERY_LENGTH) {
      res.status(400).json({ error: 'query is required and must be at most 200 characters' });
      return;
    }
    const provider = body.provider === 'mistral' ? 'mistral' : 'claude';
    const lang = body.language === 'de' ? 'de' : 'en';

    const year = new Date().getFullYear();
    const tavilyQuery =
      lang === 'de'
        ? `${query} aktuelle Kunstausstellung ${year}`
        : `${query} current art exhibition ${year}`;
    console.log(`[exhibition-search] query="${query}" tavily="${tavilyQuery}"`);
    // 8 results (vs the default 5) so the extraction has enough to filter
    // after the location constraint drops mismatched venues
    const results = await tavilySearch(tavilyQuery, 8);
    if (results.length === 0) {
      // No search results (or Tavily failed) — nothing to extract, no LLM cost
      res.json({ candidates: [] });
      return;
    }

    const systemPrompt = buildDiscoveryExtractionSystemPrompt(lang);
    const userMessage = buildDiscoveryExtractionUserMessage({ query, results });

    let rawText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'claude') {
      const response = await getClient().messages.create({
        model: MODEL,
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
        model: MISTRAL_MODEL,
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

    console.log(`[exhibition-search] provider=${provider} input=${inputTokens} output=${outputTokens}`);
    // Fire-and-forget — don't hold the response on the usage write
    recordUsage(userId, inputTokens, outputTokens)
      .catch(err => console.error('[usage] record failed:', err));

    // Models occasionally wrap JSON in markdown fences despite instructions
    const stripped = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      console.error('[exhibition-search] unparseable LLM output:', rawText.slice(0, 300));
      res.status(500).json({ error: 'Could not process search results.' });
      return;
    }

    res.json({ candidates: validateCandidates(parsed, results.map((r) => r.url)) });
  } catch (error) {
    console.error('Exhibition search error:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

export default router;
