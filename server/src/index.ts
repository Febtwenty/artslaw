import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'path';
import { clerkMiddleware } from '@clerk/express';
import { injectLandingContent } from './landingHtml';
import chatRouter from './routes/chat';
import conversationsRouter from './routes/conversations';
import titleRouter from './routes/title';
import tourRouter from './routes/tour';
import discoveriesRouter from './routes/discoveries';
import exhibitionSearchRouter from './routes/exhibitionSearch';
import usageRouter from './routes/usage';
import visitsRouter from './routes/visits';
import { blogApiRouter, blogPageRouter } from './routes/blog';
import faviconRouter from './routes/favicon';
import { ensureUsageIndexes } from './db/usage';
import { ensureVisitIndexes } from './db/visits';
import { ensureBlogIndexes, getPublishedPosts } from './db/blog';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

ensureUsageIndexes().catch(err => console.error('[usage] index setup failed:', err));
ensureBlogIndexes().catch(err => console.error('[blog] index setup failed:', err));
ensureVisitIndexes().catch(err => console.error('[visits] index setup failed:', err));

// Ensure uploads directory exists
const uploadsDir = path.resolve(__dirname, '../uploads');
fs.mkdirSync(path.join(uploadsDir, 'blog'), { recursive: true });
fs.mkdirSync(path.join(uploadsDir, 'visits'), { recursive: true });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use('/uploads', express.static(uploadsDir));
app.use(express.json());
app.use(clerkMiddleware());

app.use('/api/favicon', faviconRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/generate-title', titleRouter);
app.use('/api/tour', tourRouter);
app.use('/api/discoveries', discoveriesRouter);
app.use('/api/exhibition-search', exhibitionSearchRouter);
app.use('/api/usage', usageRouter);
app.use('/api/visits', visitsRouter);
app.use('/api/blog', blogApiRouter);

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nAllow: /blog\nDisallow: /admin\nDisallow: /api\nSitemap: https://www.artslaw.io/sitemap.xml'
  );
});

app.get('/sitemap.xml', async (_req, res) => {
  try {
    const posts = await getPublishedPosts();
    const urls = [
      '<url><loc>https://www.artslaw.io/</loc></url>',
      '<url><loc>https://www.artslaw.io/blog</loc></url>',
      ...posts.map((p) => {
        const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : '';
        return `<url><loc>https://www.artslaw.io/blog/${encodeURIComponent(p.slug)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
      }),
    ].join('\n  ');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls}\n</urlset>`
    );
  } catch (err) {
    console.error('[sitemap] error:', err);
    res.status(500).send('Failed to generate sitemap');
  }
});

app.use('/blog', blogPageRouter);

// Serve valid empty source maps for React DevTools extension files so Firefox
// doesn't throw a JSON.parse error when the SPA catch-all returns index.html.
const emptySourceMap = JSON.stringify({ version: 3, sources: [''], sourcesContent: [''], mappings: '', names: [] });
app.get(/\/(installHook|react_devtools_backend_compact)\.js\.map$/, (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(emptySourceMap);
});

// Serve the built React app in production
const clientDist = path.resolve(__dirname, '../../client/dist');
const clientIndexPath = path.join(clientDist, 'index.html');

// Pre-render the landing page at startup for SEO (Google sees real HTML, not empty #root)
let prerenderedLanding: string | null = null;
if (fs.existsSync(clientIndexPath)) {
  try {
    prerenderedLanding = injectLandingContent(fs.readFileSync(clientIndexPath, 'utf-8'));
  } catch {
    // fall through — catch-all will serve plain index.html
  }
}

const CRAWLER_RE = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver/i;

// Crawlers get pre-rendered landing HTML for SEO; browsers get the plain SPA shell to avoid a flash
app.get('/', (req, res) => {
  const ua = req.headers['user-agent'] ?? '';
  if (prerenderedLanding && CRAWLER_RE.test(ua)) {
    res.setHeader('Content-Type', 'text/html');
    return res.send(prerenderedLanding);
  }
  res.sendFile(clientIndexPath);
});

app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(clientIndexPath);
});

app.listen(PORT, () => {
  console.log(`ArtSlaw server running at http://localhost:${PORT}`);
});
