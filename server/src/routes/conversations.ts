import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getDb } from '../db';

const router = Router();

function h(fn: RequestHandler): RequestHandler {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /api/conversations
router.get('/', h(async (req: Request, res: Response) => {
  const { userId } = (req as any).auth?.() ?? {};
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const db = await getDb();
  const docs = await db
    .collection('conversations')
    .find({ userId })
    .sort({ updatedAt: -1 })
    .toArray();

  const conversations = docs.map((d) => ({
    id:            d._id as string,
    title:         d.title,
    exhibitionUrl: d.exhibitionUrl,
    messages:      d.messages ?? [],
    createdAt:     d.createdAt,
    updatedAt:     d.updatedAt,
  }));

  res.json(conversations);
}));

// POST /api/conversations
router.post('/', h(async (req: Request, res: Response) => {
  const { userId } = (req as any).auth?.() ?? {};
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const { id, title, exhibitionUrl, messages, createdAt, updatedAt } = req.body;
  if (!id || !title || !exhibitionUrl || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Missing required fields.' }); return;
  }

  const db = await getDb();
  await db.collection('conversations').insertOne({
    _id: id as any,
    userId,
    title,
    exhibitionUrl,
    messages,
    createdAt,
    updatedAt,
  });

  res.status(201).json({ ok: true });
}));

// PUT /api/conversations/:id
router.put('/:id', h(async (req: Request, res: Response) => {
  const { userId } = (req as any).auth?.() ?? {};
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const { messages, updatedAt } = req.body;
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required.' }); return;
  }

  const db = await getDb();
  const result = await db.collection('conversations').updateOne(
    { _id: req.params.id as any, userId },
    { $set: { messages, updatedAt } }
  );

  if (result.matchedCount === 0) {
    res.status(404).json({ error: 'Conversation not found.' }); return;
  }

  res.json({ ok: true });
}));

// DELETE /api/conversations/:id
router.delete('/:id', h(async (req: Request, res: Response) => {
  const { userId } = (req as any).auth?.() ?? {};
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const db = await getDb();
  const result = await db.collection('conversations').deleteOne({
    _id: req.params.id as any,
    userId,
  });

  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Conversation not found.' }); return;
  }

  res.json({ ok: true });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[conversations]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default router;
