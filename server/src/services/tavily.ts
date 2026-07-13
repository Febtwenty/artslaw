export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

// 'basic' is the right depth for per-question research lookups — cheaper and
// faster than 'advanced', which is meant for deep multi-page crawling.
const SEARCH_DEPTH = 'basic';
const MAX_RESULTS = 5;
const MAX_CONTENT_LENGTH = 1500;

export async function tavilySearch(query: string, maxResults: number = MAX_RESULTS): Promise<TavilyResult[]> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: SEARCH_DEPTH,
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
