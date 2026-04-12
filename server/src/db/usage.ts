import { getDb } from '../db';
import type { UsageLimits } from '../config/limits';

const COLLECTION = 'token_usage';

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function utcMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

export async function ensureUsageIndexes(): Promise<void> {
  const db = await getDb();
  const col = db.collection(COLLECTION);
  await col.createIndex({ userId: 1, dateKey: 1 }, { unique: true });
  await col.createIndex({ userId: 1, monthKey: 1 });
}

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const dateKey = utcDateKey(now);
  const monthKey = utcMonthKey(now);

  await db.collection(COLLECTION).updateOne(
    { userId, dateKey },
    {
      $inc: { inputTokens, outputTokens },
      $set: { monthKey, updatedAt: now },
      $setOnInsert: { userId, dateKey },
    },
    { upsert: true }
  );
}

export async function getDailyUsage(userId: string): Promise<number> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ userId, dateKey: utcDateKey(new Date()) });
  if (!doc) return 0;
  return (doc.inputTokens ?? 0) + (doc.outputTokens ?? 0);
}

export async function getMonthlyUsage(userId: string): Promise<number> {
  const db = await getDb();
  const docs = await db
    .collection(COLLECTION)
    .find({ userId, monthKey: utcMonthKey(new Date()) })
    .toArray();
  return docs.reduce((s, d) => s + (d.inputTokens ?? 0) + (d.outputTokens ?? 0), 0);
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: 'daily_limit' | 'monthly_limit';
  daily: { used: number; limit: number };
  monthly: { used: number; limit: number };
  resetsAt?: Date;
}

export async function checkLimits(
  userId: string,
  limits: UsageLimits | null
): Promise<UsageCheckResult> {
  const [dailyUsed, monthlyUsed] = await Promise.all([
    getDailyUsage(userId),
    getMonthlyUsage(userId),
  ]);

  if (!limits) {
    return {
      allowed: true,
      daily:   { used: dailyUsed,   limit: Infinity },
      monthly: { used: monthlyUsed, limit: Infinity },
    };
  }

  const daily   = { used: dailyUsed,   limit: limits.dailyTokens };
  const monthly = { used: monthlyUsed, limit: limits.monthlyTokens };

  if (dailyUsed >= limits.dailyTokens) {
    const n = new Date();
    return {
      allowed: false,
      reason: 'daily_limit',
      daily,
      monthly,
      resetsAt: new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)),
    };
  }

  if (monthlyUsed >= limits.monthlyTokens) {
    const n = new Date();
    return {
      allowed: false,
      reason: 'monthly_limit',
      daily,
      monthly,
      resetsAt: new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)),
    };
  }

  return { allowed: true, daily, monthly };
}
