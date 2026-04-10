import express, { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import * as cheerio from 'cheerio';
import { getDb } from '../db';
import { FEATURED_EXHIBITIONS } from '../featuredExhibitions';

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
  imageUrl: string | null;
}

function resolveImageUrl(attr: any): string | null {
  const medium = attr?.image_versions?.medium;
  if (typeof medium === 'string' && medium.startsWith('https://')) return medium;
  return null;
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
        imageUrl: resolveImageUrl(attr),
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

    // No artist history yet — return curated starter exhibitions
    if (artistTourMap.size === 0) {
      res.json(FEATURED_EXHIBITIONS.map((e) => ({ ...e, scrapedAt: new Date() })));
      return;
    }

    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    const allResults: any[] = [];
    const artistNames = [...artistTourMap.keys()];

    // Batch-fetch all cached entries in one query
    const allCached = await db
      .collection('discoveries')
      .find({ artistName: { $in: artistNames }, scrapedAt: { $gte: cutoff } })
      .toArray();

    const freshArtists = new Set(allCached.map((d: any) => d.artistName as string));
    allResults.push(...allCached);

    // Determine which artists need re-scraping
    const staleArtists = artistNames.filter((name) => !freshArtists.has(name));

    if (staleArtists.length > 0) {
      // Delete all stale entries in one batch
      await db.collection('discoveries').deleteMany({ artistName: { $in: staleArtists } });

      // Scrape stale artists in parallel
      const scrapeResults = await Promise.allSettled(
        staleArtists.map((artistName) =>
          scrapeArtistExhibitions(artistName).then((exhibitions) => ({ artistName, exhibitions }))
        )
      );

      for (const result of scrapeResults) {
        if (result.status !== 'fulfilled') continue;
        const { artistName, exhibitions } = result.value;
        if (exhibitions.length === 0) continue;
        const tourId = artistTourMap.get(artistName)!;
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
