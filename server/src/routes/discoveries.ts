import express, { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import * as cheerio from 'cheerio';
import { getDb } from '../db';

const router = express.Router();
const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const BASE_URL = 'https://www.contemporaryartlibrary.org';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchNextData(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArtSlaw/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const scriptContent = $('#__NEXT_DATA__').text();
    if (!scriptContent) return null;
    return JSON.parse(scriptContent);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findArtistPageUrl(artistName: string): Promise<string | null> {
  const data = await fetchNextData(
    `${BASE_URL}/search?q=${encodeURIComponent(artistName)}`
  );
  if (!data) return null;
  const items: any[] = data?.props?.pageProps?.items ?? [];
  const artistItem = items.find((item: any) => item.type === 'artist');
  if (!artistItem?.slug) return null;
  return `${BASE_URL}/artist/${artistItem.slug}`;
}

interface ExhibitionRaw {
  exhibitionTitle: string;
  gallery: string;
  city: string;
  dates: string;
  url: string;
  sortableDate: string;
}

function extractExhibitions(nextData: any, depth = 0): ExhibitionRaw[] {
  if (depth > 20) return [];
  const results: ExhibitionRaw[] = [];

  function search(obj: any, d: number) {
    if (d > 20 || !obj || typeof obj !== 'object') return;
    if (
      obj.type === 'cal_project_listing' &&
      obj.attributes &&
      !obj.attributes.is_group_exhibition &&
      !obj.attributes.is_curated_project &&
      obj.attributes.cal_slug
    ) {
      const attr = obj.attributes;
      results.push({
        exhibitionTitle: attr.listing_title ?? attr.title ?? '',
        gallery: attr.listing_venue ?? '',
        city: attr.city ?? '',
        dates: attr.date ?? '',
        url: `${BASE_URL}/project/${attr.cal_slug}`,
        sortableDate: attr.sortable_date ?? '',
      });
      return; // don't recurse into a matched node
    }
    if (Array.isArray(obj)) {
      obj.forEach((item) => search(item, d + 1));
    } else {
      Object.values(obj).forEach((val) => search(val, d + 1));
    }
  }

  search(nextData, 0);
  return results
    .sort((a, b) => b.sortableDate.localeCompare(a.sortableDate))
    .slice(0, 3);
}

async function scrapeArtistExhibitions(artistName: string): Promise<ExhibitionRaw[]> {
  const artistUrl = await findArtistPageUrl(artistName);
  if (!artistUrl) return [];
  const data = await fetchNextData(artistUrl);
  if (!data) return [];
  return extractExhibitions(data);
}

router.get(
  '/',
  h(async (req: Request, res: Response) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const db = await getDb();

    // Fetch user's tours and extract unique artist names
    const conversations = await db
      .collection('conversations')
      .find({ userId })
      .toArray();

    // Sort by most recently updated, then take first 10 unique artists
    const sorted = [...conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const artistTourMap = new Map<string, string>();
    for (const conv of sorted) {
      if (artistTourMap.size >= 10) break;
      if (conv.title && conv.title.includes(' - ') && conv.title !== 'Untitled Tour') {
        const artistName = conv.title.split(' - ')[0].trim();
        if (artistName && !artistTourMap.has(artistName)) {
          artistTourMap.set(artistName, String(conv._id));
        }
      }
    }

    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const allResults: any[] = [];

    for (const [artistName, tourId] of artistTourMap.entries()) {
      // Check cache
      const cached = await db
        .collection('discoveries')
        .find({ artistName, scrapedAt: { $gte: cutoff } })
        .toArray();

      if (cached.length > 0) {
        allResults.push(...cached);
        continue;
      }

      // Stale or missing — delete old entries and re-scrape
      await db.collection('discoveries').deleteMany({ artistName });

      let exhibitions: ExhibitionRaw[] = [];
      try {
        exhibitions = await scrapeArtistExhibitions(artistName);
      } catch {
        // silently skip failed artists
      }

      if (exhibitions.length > 0) {
        const docs = exhibitions.map(({ sortableDate: _sd, ...ex }) => ({
          ...ex,
          artistName,
          sourceArtistFromTourId: tourId,
          scrapedAt: new Date(),
        }));
        await db.collection('discoveries').insertMany(docs);
        allResults.push(...docs);
      }
    }

    // Deduplicate by exhibition URL
    const seen = new Set<string>();
    const deduped = allResults.filter((r) => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Filter out exhibitions the user has already toured
    const touredUrls = new Set(
      conversations.map((c: any) => c.exhibitionUrl).filter(Boolean)
    );
    const filtered = deduped.filter((r) => !touredUrls.has(r.url));

    // Sort by scrapedAt descending (most recently scraped artist first)
    filtered.sort(
      (a, b) =>
        new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
    );

    res.json(filtered);
  })
);

export default router;
