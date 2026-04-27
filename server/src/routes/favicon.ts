import { Router, Request, Response } from 'express';

const router = Router();

const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

router.get('/', async (req: Request, res: Response) => {
  const domain = String(req.query.domain ?? '').toLowerCase().slice(0, 253);

  if (!domain || !DOMAIN_RE.test(domain)) {
    return res.status(400).end();
  }

  try {
    const upstream = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);

    if (!upstream.ok) {
      return res.status(204).end();
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = await upstream.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(204).end();
  }
});

export default router;
