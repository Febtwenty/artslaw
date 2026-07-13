import { RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import { checkLimits } from '../db/usage';
import { getLimitsForUser } from '../config/limits';

export const checkUsageLimits: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) { next(); return; } // main handler re-checks auth
  try {
    const result = await checkLimits(userId, getLimitsForUser(userId));
    if (!result.allowed) {
      res.status(429).json({
        error: 'limit_exceeded',
        reason: result.reason,
        usage: { daily: result.daily, monthly: result.monthly },
        resetsAt: result.resetsAt?.toISOString(),
      });
      return;
    }
    next();
  } catch (err) {
    console.error('[usage] limit check failed:', err);
    next(); // fail-open: don't block the request if usage DB is temporarily down
  }
};
