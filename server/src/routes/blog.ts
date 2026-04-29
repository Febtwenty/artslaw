import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import Anthropic from '@anthropic-ai/sdk';
import { marked } from 'marked';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import {
  createPost, updatePost, deletePost, getPost, getAllPosts,
  getPublishedPosts, getPublishedPost,
} from '../db/blog';

// ---------------------------------------------------------------------------
// Admin auth — read env at call time, NOT at module load time.
// Imports are hoisted and execute before dotenv.config() runs in index.ts,
// so any module-level env read returns undefined.
// ---------------------------------------------------------------------------

function isAdminUser(userId: string): boolean {
  return (process.env.UNLIMITED_USER_IDS ?? '').split(',').filter(Boolean).includes(userId);
}

const requireAdmin: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  if (!userId || !isAdminUser(userId)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};

// ---------------------------------------------------------------------------
// Anthropic client (lazy, same pattern as chat.ts)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

async function fetchPageContent(url: string): Promise<string | null> {
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
    return text.length > 3000 ? text.slice(0, 3000) + '…' : text;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File upload (multer)
// ---------------------------------------------------------------------------

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/blog');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

function deleteUploadedFile(url: string): void {
  if (!url.startsWith('/uploads/blog/')) return;
  fs.unlink(path.join(UPLOADS_DIR, path.basename(url)), () => {});
}

function deleteCoverFiles(coverImage: { url: string; thumbnailUrl?: string }): void {
  deleteUploadedFile(coverImage.url);
  if (coverImage.thumbnailUrl) deleteUploadedFile(coverImage.thumbnailUrl);
}

async function processAndSaveImage(buffer: Buffer, slug: string): Promise<{ url: string; thumbnailUrl: string }> {
  const ts = Date.now();
  const fullName = `${slug}-${ts}.webp`;
  const thumbName = `${slug}-${ts}-thumb.webp`;

  // .rotate() with no args auto-corrects EXIF orientation (essential for phone photos)
  await sharp(buffer)
    .rotate()
    .resize(1200, 1200, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(path.join(UPLOADS_DIR, fullName));

  await sharp(buffer)
    .rotate()
    .resize(160, 160, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(path.join(UPLOADS_DIR, thumbName));

  return {
    url: `/uploads/blog/${fullName}`,
    thumbnailUrl: `/uploads/blog/${thumbName}`,
  };
}

// ---------------------------------------------------------------------------
// API router — mounted at /api/blog in index.ts
// ---------------------------------------------------------------------------

export const blogApiRouter = Router();

// GET /api/blog/me — returns isAdmin flag for the client
blogApiRouter.get('/me', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Unauthenticated' }); return; }
  res.json({ isAdmin: isAdminUser(userId) });
});

// POST /api/blog/generate — generate a draft via Claude + web search
blogApiRouter.post('/generate', requireAdmin, async (req: Request, res: Response) => {
  const { exhibitionUrl } = req.body as { exhibitionUrl?: string };
  if (!exhibitionUrl) {
    res.status(400).json({ error: 'exhibitionUrl is required' });
    return;
  }

  const pageContent = await fetchPageContent(exhibitionUrl);
  const pageSection = pageContent
    ? `\n\nHere is the text content of the exhibition page:\n"""\n${pageContent}\n"""`
    : '';

  const userMessage = `Research this exhibition: ${exhibitionUrl}${pageSection}`;

  // Phase 1: research freely with web_search — no JSON requirement
  const researchSystem = `You are ArtSlaw, an expert art critic. Research the given exhibition using web search.
Find: exhibition title, dates, venue, the artist(s), key works on display, cultural context, and visitor information.
Summarise everything you find in plain prose.`;

  // Phase 2: format into JSON — no tools, just structured output
  const formatSystem = `You are ArtSlaw, an expert art critic. Based on the research in the conversation, write a blog review.
Return ONLY a raw JSON object with these exact fields — no markdown fences, no prose before or after:
{
  "title": "clear, informative headline",
  "metaDescription": "max 160 chars SEO summary",
  "body": "full review in markdown with H2 sections: Overview, The Artist, Key Works to Look For, In Perspective, Visitor Info",
  "tags": ["artist name", "gallery", "city", "movement"],
  "suggestedSlug": "url-friendly-slug"
}
Write with critical honesty — not every exhibition is groundbreaking. The review should reflect the actual quality and significance of the work.`;

  const tools: Anthropic.Messages.WebSearchTool20250305[] = [
    { type: 'web_search_20250305', name: 'web_search' } as Anthropic.Messages.WebSearchTool20250305,
  ];

  try {
    // Phase 1: let Haiku research via web_search
    let msgs: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
    let result = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      system: researchSystem,
      tools,
      messages: msgs,
    });

    while (result.stop_reason === 'pause_turn' || result.stop_reason === 'tool_use') {
      msgs = [...msgs, { role: 'assistant', content: result.content }];
      result = await getClient().messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: researchSystem,
        tools,
        messages: msgs,
      });
    }

    // Phase 2: format research into JSON — no tools so model must just output text
    msgs = [
      ...msgs,
      { role: 'assistant', content: result.content },
      { role: 'user', content: 'Now write the blog review. Return ONLY the raw JSON object, starting with { and ending with }.' },
    ];
    const formatResult = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4000,
      system: formatSystem,
      messages: msgs,
    });

    const textBlock = formatResult.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      res.status(500).json({ error: 'No text response from Claude' });
      return;
    }

    // Extract the JSON object — strip any accidental markdown fences or prose
    let parsed: unknown;
    const raw = textBlock.text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      console.error('[blog] Claude response contained no JSON object:', raw.slice(0, 200));
      res.status(500).json({ error: 'Claude did not return a JSON object. Try again.' });
      return;
    }
    parsed = JSON.parse(raw.slice(start, end + 1));

    res.json(parsed);
  } catch (err) {
    console.error('[blog] generate error:', err);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// GET /api/blog/posts — list all posts (admin)
blogApiRouter.get('/posts', requireAdmin, async (_req: Request, res: Response) => {
  const posts = await getAllPosts();
  res.json(posts);
});

// POST /api/blog/posts — create a post (admin)
blogApiRouter.post('/posts', requireAdmin, async (req: Request, res: Response) => {
  const { slug, title, metaDescription, body, exhibitionUrl, tags, status, coverImage, publishedAt: publishedAtRaw } = req.body;
  if (!slug || !title || !body) {
    res.status(400).json({ error: 'slug, title, and body are required' });
    return;
  }
  try {
    const publishedAt = publishedAtRaw
      ? new Date(publishedAtRaw)
      : (status === 'published' ? new Date() : null);
    const post = await createPost({
      slug, title, metaDescription, body, exhibitionUrl,
      tags: tags ?? [], status: status ?? 'draft', publishedAt,
      ...(coverImage ? { coverImage } : {}),
    });
    res.status(201).json(post);
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      res.status(409).json({ error: 'A post with that slug already exists' });
    } else {
      console.error('[blog] create error:', err);
      res.status(500).json({ error: 'Failed to create post' });
    }
  }
});

// PUT /api/blog/posts/:slug — update a post (admin)
blogApiRouter.put('/posts/:slug', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { publishedAt: publishedAtRaw, ...rest } = req.body;
    const update = { ...rest } as import('../db/blog').BlogPostUpdate;
    if ('publishedAt' in req.body) {
      update.publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
    }
    const post = await updatePost(req.params.slug, update);
    if (!post) { res.status(404).json({ error: 'Post not found' }); return; }
    res.json(post);
  } catch (err) {
    console.error('[blog] update error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// POST /api/blog/posts/:slug/cover-image — upload a cover photo (admin)
blogApiRouter.post(
  '/posts/:slug/cover-image',
  requireAdmin,
  upload.single('image'),
  async (req: Request, res: Response) => {
    const { slug } = req.params;
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No image file provided' }); return; }

    const existing = await getPost(slug);
    if (!existing) { res.status(404).json({ error: 'Post not found' }); return; }
    if (existing.coverImage?.type === 'uploaded') deleteCoverFiles(existing.coverImage);

    const { url, thumbnailUrl } = await processAndSaveImage(file.buffer, slug);
    const alt = typeof req.body.alt === 'string' ? req.body.alt : '';
    const post = await updatePost(slug, { coverImage: { type: 'uploaded', url, thumbnailUrl, alt } });
    res.json(post);
  },
);

// DELETE /api/blog/posts/:slug/cover-image — remove cover image (admin)
blogApiRouter.delete('/posts/:slug/cover-image', requireAdmin, async (req: Request, res: Response) => {
  const existing = await getPost(req.params.slug);
  if (!existing) { res.status(404).json({ error: 'Post not found' }); return; }
  if (existing.coverImage?.type === 'uploaded') deleteCoverFiles(existing.coverImage);
  const post = await updatePost(req.params.slug, { coverImage: null });
  res.json(post);
});

// DELETE /api/blog/posts/:slug — delete a post (admin)
blogApiRouter.delete('/posts/:slug', requireAdmin, async (req: Request, res: Response) => {
  const existing = await getPost(req.params.slug);
  if (existing?.coverImage?.type === 'uploaded') deleteCoverFiles(existing.coverImage);
  await deletePost(req.params.slug);
  res.status(204).end();
});

// GET /api/blog/published — list published posts (public, no body)
blogApiRouter.get('/published', async (_req: Request, res: Response) => {
  const posts = await getPublishedPosts();
  res.json(posts);
});

// GET /api/blog/published/:slug — single published post (public)
blogApiRouter.get('/published/:slug', async (req: Request, res: Response) => {
  const post = await getPublishedPost(req.params.slug);
  if (!post) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(post);
});

// ---------------------------------------------------------------------------
// Page router — mounted at /blog in index.ts
// Server-rendered HTML for SEO — never falls through to the React SPA.
// ---------------------------------------------------------------------------

export const blogPageRouter = Router();

const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-family: 'Inter', system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  body { min-height: 100vh; display: flex; flex-direction: column; }
  a { color: #4f46e5; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .site-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 1.25rem 1.5rem; display: flex; align-items: center; justify-content: space-between; }
  .site-header a { color: inherit; font-weight: 600; font-size: 1rem; }
  .site-footer { background: #fff; border-top: 1px solid #e2e8f0; padding: 1rem 1.5rem; text-align: center; font-size: 0.75rem; color: #94a3b8; margin-top: auto; }
  .container { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; flex: 1; }
  .blog-cta { display: inline-block; margin-top: 2.5rem; padding: 0.875rem 2rem; background: #4f46e5; color: #fff !important; border-radius: 0.75rem; font-weight: 500; font-size: 0.95rem; transition: background 0.15s; }
  .blog-cta:hover { background: #4338ca; text-decoration: none; }
`;

const GOOGLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet">`;

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// GET /blog
blogPageRouter.get('/', async (_req: Request, res: Response) => {
  const posts = await getPublishedPosts();

  const postItems = posts.length === 0
    ? '<p style="color:#64748b;">No posts published yet.</p>'
    : posts.map((p) => {
        const thumb = p.coverImage
          ? `<div style="flex-shrink:0;align-self:flex-start;">
              <img src="${escapeHtml(p.coverImage.thumbnailUrl ?? p.coverImage.url)}" alt="${escapeHtml(p.coverImage.alt ?? '')}" style="width:80px;height:80px;object-fit:cover;border-radius:0.5rem;display:block;">
              ${p.coverImage.type === 'external' && p.coverImage.source ? `<p style="font-size:0.65rem;color:#94a3b8;margin-top:0.25rem;text-align:right;">${escapeHtml(p.coverImage.source)}</p>` : ''}
            </div>`
          : '';
        return `
      <article style="padding:1.5rem 0;border-bottom:1px solid #e2e8f0;display:flex;gap:1.25rem;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <a href="/blog/${escapeHtml(p.slug)}" style="font-family:'Playfair Display',Georgia,serif;font-size:1.375rem;font-weight:600;color:#0f172a;line-height:1.3;">${escapeHtml(p.title)}</a>
          <p style="margin:0.5rem 0 0.75rem;color:#64748b;font-size:0.9rem;">${escapeHtml(p.metaDescription ?? '')}</p>
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <span style="font-size:0.75rem;color:#94a3b8;">${formatDate(p.publishedAt)}</span>
            ${(p.tags ?? []).slice(0, 4).map((t: string) => `<span style="font-size:0.7rem;padding:0.2rem 0.6rem;background:#eef2ff;color:#4f46e5;border-radius:9999px;">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        ${thumb}
      </article>`;
      }).join('');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'ArtSlaw Blog',
    description: 'Expert exhibition reviews and art criticism from ArtSlaw.',
    url: 'https://www.artslaw.io/blog',
    publisher: { '@type': 'Organization', name: 'ArtSlaw', url: 'https://www.artslaw.io' },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Art Exhibition Reviews — ArtSlaw Blog</title>
  <meta name="description" content="In-depth art exhibition reviews and criticism from ArtSlaw — your expert gallery companion.">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Art Exhibition Reviews — ArtSlaw Blog">
  <meta property="og:description" content="In-depth art exhibition reviews and criticism from ArtSlaw — your expert gallery companion.">
  <meta property="og:url" content="https://www.artslaw.io/blog">
  <meta property="og:site_name" content="ArtSlaw">
  <link rel="canonical" href="https://www.artslaw.io/blog">
  ${GOOGLE_FONTS}
  <script type="application/ld+json">${jsonLd}</script>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <header class="site-header">
    <a href="/">ArtSlaw</a>
    <a href="/" style="font-size:0.85rem;color:#64748b;font-weight:400;">Start a gallery tour &rarr;</a>
  </header>
  <main class="container">
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:2.25rem;font-weight:700;margin-bottom:0.5rem;line-height:1.2;">Exhibition Reviews</h1>
    <p style="color:#64748b;margin-bottom:2rem;font-size:0.95rem;">Expert reviews of current and upcoming exhibitions — written by ArtSlaw.</p>
    ${postItems}
  </main>
  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} ArtSlaw &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></p>
  </footer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});

// GET /blog/:slug
blogPageRouter.get('/:slug', async (req: Request, res: Response) => {
  const post = await getPublishedPost(req.params.slug);
  if (!post) { res.status(404).send('<h1>404 – Post not found</h1>'); return; }

  const bodyHtml = await marked.parse(post.body);
  const canonicalUrl = `https://www.artslaw.io/blog/${encodeURIComponent(post.slug)}`;
  const publishedIso = post.publishedAt ? new Date(post.publishedAt).toISOString() : new Date(post.createdAt).toISOString();
  const modifiedIso = new Date(post.updatedAt).toISOString();

  const heroHtml = post.coverImage
    ? `<figure style="margin:0 0 2rem;">
        <img src="${escapeHtml(post.coverImage.url)}" alt="${escapeHtml(post.coverImage.alt ?? '')}" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:0.75rem;display:block;">
        ${post.coverImage.type === 'external' && post.coverImage.source ? `<figcaption style="text-align:right;font-size:0.75rem;color:#94a3b8;margin-top:0.375rem;">${escapeHtml(post.coverImage.source)}</figcaption>` : ''}
      </figure>`
    : '';

  const ogImage = post.coverImage
    ? `<meta property="og:image" content="${post.coverImage.url.startsWith('/') ? `https://www.artslaw.io${post.coverImage.url}` : escapeHtml(post.coverImage.url)}">`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.metaDescription,
    ...(post.coverImage ? { image: post.coverImage.url.startsWith('/') ? `https://www.artslaw.io${post.coverImage.url}` : post.coverImage.url } : {}),
    author: { '@type': 'Organization', name: 'ArtSlaw', url: 'https://www.artslaw.io' },
    publisher: { '@type': 'Organization', name: 'ArtSlaw', url: 'https://www.artslaw.io' },
    datePublished: publishedIso,
    dateModified: modifiedIso,
    url: canonicalUrl,
    keywords: (post.tags ?? []).join(', '),
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title)} — ArtSlaw</title>
  <meta name="description" content="${escapeHtml(post.metaDescription)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(post.metaDescription)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="ArtSlaw">
  ${ogImage}
  <meta property="article:published_time" content="${publishedIso}">
  <meta property="article:modified_time" content="${modifiedIso}">
  <link rel="canonical" href="${canonicalUrl}">
  ${GOOGLE_FONTS}
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    ${SHARED_CSS}
    .post-body { line-height: 1.8; font-size: 1.0625rem; color: #1e293b; }
    .post-body h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 1.5rem; font-weight: 600; margin: 2rem 0 0.75rem; color: #0f172a; }
    .post-body h3 { font-family: 'Playfair Display', Georgia, serif; font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
    .post-body p { margin-bottom: 1.25rem; }
    .post-body ul, .post-body ol { margin: 0 0 1.25rem 1.5rem; }
    .post-body li { margin-bottom: 0.375rem; }
    .post-body a { color: #4f46e5; }
    .post-body a:hover { text-decoration: underline; }
    .post-body blockquote { border-left: 3px solid #e2e8f0; padding-left: 1rem; color: #64748b; margin: 1.5rem 0; font-style: italic; }
    .post-body strong { font-weight: 600; }
    .post-meta { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin: 0.75rem 0 2rem; }
    .post-tag { font-size: 0.7rem; padding: 0.2rem 0.6rem; background: #eef2ff; color: #4f46e5; border-radius: 9999px; }
    .post-date { font-size: 0.8rem; color: #94a3b8; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 2.5rem 0; }
    .cta-box { background: #eef2ff; border-radius: 1rem; padding: 1.5rem 2rem; text-align: center; }
    .cta-box p { color: #4b5563; margin-bottom: 1rem; }
    .back-link { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.85rem; color: #64748b; margin-bottom: 1.5rem; }
    .back-link:hover { color: #4f46e5; text-decoration: none; }
  </style>
</head>
<body>
  <header class="site-header">
    <a href="/">ArtSlaw</a>
    <a href="/blog" style="font-size:0.85rem;color:#64748b;font-weight:400;">&larr; All reviews</a>
  </header>
  <main class="container">
    <a href="/blog" class="back-link">&#8592; All reviews</a>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:2rem;font-weight:700;line-height:1.25;margin-bottom:0.5rem;">${escapeHtml(post.title)}</h1>
    <div class="post-meta">
      <span class="post-date">${formatDate(post.publishedAt)}</span>
      ${(post.tags ?? []).map((t: string) => `<span class="post-tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    ${heroHtml}
    <div class="post-body">${bodyHtml}</div>
    <hr class="divider">
    <div class="cta-box">
      <p>Want to explore this exhibition with an expert guide?</p>
      <a href="/" class="blog-cta">Start a tour on ArtSlaw</a>
    </div>
  </main>
  <footer class="site-footer">
    <p>&copy; ${new Date().getFullYear()} ArtSlaw &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a></p>
  </footer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});
