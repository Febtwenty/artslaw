// 6000 (raised from 3000): exhibition pages often list the actual works past
// the 3k mark — cutting there starved the models of exactly the details they
// then invented. Costs ~750 extra input tokens per model round-trip.
const MAX_PAGE_CONTENT_LENGTH = 6000;

export async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArtSlaw/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, ' ')
      .trim();

    return text.length > MAX_PAGE_CONTENT_LENGTH ? text.slice(0, MAX_PAGE_CONTENT_LENGTH) + '…' : text;
  } catch {
    return null;
  }
}
