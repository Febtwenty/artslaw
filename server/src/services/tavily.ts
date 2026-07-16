export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

// 'advanced' extracts up to CHUNKS_PER_SOURCE relevant ~500-char chunks per
// result instead of the thin snippets 'basic' returns (measured median: 571
// chars) — the models need that substance to ground tour facts. Costs 2
// Tavily credits per search instead of 1.
const SEARCH_DEPTH = 'advanced';
const CHUNKS_PER_SOURCE = 3;
const MAX_RESULTS = 5;
const MAX_CONTENT_LENGTH = 2000;

export async function tavilySearch(query: string, maxResults: number = MAX_RESULTS): Promise<TavilyResult[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: SEARCH_DEPTH,
        chunks_per_source: CHUNKS_PER_SOURCE,
        max_results: maxResults,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const data = await res.json() as { results?: { title: string; url: string; content: string }[] };
    if (!Array.isArray(data.results)) return [];

    console.log(`[tavily] search: "${query}" -> ${data.results.length} result(s)`);

    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content.length > MAX_CONTENT_LENGTH ? r.content.slice(0, MAX_CONTENT_LENGTH) + '…' : r.content,
    }));
  } catch (err) {
    console.error('[tavily] search failed:', err);
    return [];
  }
}
