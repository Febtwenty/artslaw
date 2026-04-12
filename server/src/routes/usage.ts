import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import { getDailyUsage, getMonthlyUsage } from '../db/usage';
import { getLimitsForUser } from '../config/limits';

const router = Router();

function h(fn: RequestHandler): RequestHandler {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const limits = getLimitsForUser(userId);
  const [dailyUsed, monthlyUsed] = await Promise.all([
    getDailyUsage(userId),
    getMonthlyUsage(userId),
  ]);

  res.json({
    daily:   { used: dailyUsed,   limit: limits.dailyTokens },
    monthly: { used: monthlyUsed, limit: limits.monthlyTokens },
  });
}));

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[usage]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default router;
