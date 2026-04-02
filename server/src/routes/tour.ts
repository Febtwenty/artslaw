import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getDb } from '../db';

const router = Router();

function h(fn: RequestHandler): RequestHandler {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /api/tour/:id — public, no auth required
router.get('/:id', h(async (req: Request, res: Response) => {
  const db = await getDb();
  const doc = await db.collection('conversations').findOne({ _id: req.params.id as any });

  if (!doc) {
    res.status(404).json({ error: 'Tour not found.' });
    return;
  }

  res.json({
    id:            doc._id as unknown as string,
    title:         doc.title,
    exhibitionUrl: doc.exhibitionUrl,
    messages:      doc.messages ?? [],
  });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[tour]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default router;
