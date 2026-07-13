export function titleFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname.split('/').filter(Boolean).pop() ?? hostname;
    const readable = slug.replace(/[-_]/g, ' ');
    return readable.length > 40 ? readable.slice(0, 37) + '...' : readable;
  } catch {
    return url.slice(0, 40);
  }
}

// Returns a normalized https URL when the input looks like one (full URL or
// bare hostname like "moma.org/exhibitions/..."), or null when it reads as a
// free-text search query (spaces, no dot) that should go through discovery.
export function normalizeUrlInput(input: string): string | null {
  if (/\s/.test(input)) return null;
  try {
    const { protocol } = new URL(input);
    if (protocol === 'http:' || protocol === 'https:') return input;
    return null;
  } catch {
    // not an absolute URL — fall through to the hostname heuristic
  }
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(input)) return `https://${input}`;
  return null;
}

export async function authedFetch(
  getToken: () => Promise<string | null>,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

export async function authedUpload(
  getToken: () => Promise<string | null>,
  path: string,
  formData: FormData
): Promise<Response> {
  const token = await getToken();
  // No Content-Type header — browser sets multipart/form-data with correct boundary
  return fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
}
