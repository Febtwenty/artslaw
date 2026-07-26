import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import { upsertFeedback, deleteFeedback } from '../db/feedback';

const router = Router();

function h(fn: RequestHandler): RequestHandler {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /api/feedback
// Upsert a thumbs-up/down rating for a single assistant message. `rating: null`
// removes the rating (toggle-off). One record per (userId, messageId).
router.post('/', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const {
    messageId,
    rating,
    reason,
    comment,
    provider,
    exhibitionUrl,
    conversationId,
    messageText,
    userPrompt,
  } = req.body ?? {};

  if (!messageId || typeof messageId !== 'string') {
    res.status(400).json({ error: 'messageId required.' }); return;
  }

  if (rating === null) {
    await deleteFeedback(userId, messageId);
    res.json({ ok: true });
    return;
  }

  if (rating !== 'up' && rating !== 'down') {
    res.status(400).json({ error: "rating must be 'up', 'down', or null." }); return;
  }

  await upsertFeedback(userId, messageId, {
    rating,
    reason: typeof reason === 'string' ? reason : undefined,
    comment: typeof comment === 'string' ? comment : undefined,
    provider: provider === 'mistral' ? 'mistral' : 'claude',
    exhibitionUrl: typeof exhibitionUrl === 'string' ? exhibitionUrl : undefined,
    conversationId: typeof conversationId === 'string' ? conversationId : undefined,
    messageText: typeof messageText === 'string' ? messageText : '',
    userPrompt: typeof userPrompt === 'string' ? userPrompt : undefined,
  });

  res.json({ ok: true });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[feedback]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default router;
