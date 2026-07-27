import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import { monthKeyOf } from '../config/gamification';

const VISITS = 'exhibition_visits';
const STATS = 'user_stats';

export interface VisitDoc {
  _id: string; // server-generated UUID
  userId: string;
  exhibitionUrl: string;
  title: string;
  conversationId?: string;
  visitedAt: Date;
  monthKey: string; // "YYYY-MM"
  photo?: { url: string; thumbnailUrl?: string };
  createdAt: Date;
}

export interface UserStatsDoc {
  _id: string; // userId
  points: number;
  badges: { id: string; earnedAt: Date }[];
  paidStreakMonths: string[];
  photoBonusUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

export async function ensureVisitIndexes(): Promise<void> {
  const db = await getDb();
  const col = db.collection(VISITS);
  await col.createIndex({ userId: 1, exhibitionUrl: 1 }, { unique: true });
  await col.createIndex({ userId: 1, visitedAt: -1 });
}

export async function getVisits(userId: string): Promise<VisitDoc[]> {
  const db = await getDb();
  return db
    .collection<VisitDoc>(VISITS)
    .find({ userId })
    .sort({ visitedAt: -1 })
    .toArray();
}

export async function getVisit(userId: string, id: string): Promise<VisitDoc | null> {
  const db = await getDb();
  return db.collection<VisitDoc>(VISITS).findOne({ _id: id, userId });
}

export async function ensureStats(userId: string): Promise<UserStatsDoc> {
  const db = await getDb();
  const now = new Date();
  const doc = await db.collection<UserStatsDoc>(STATS).findOneAndUpdate(
    { _id: userId },
    {
      $setOnInsert: {
        points: 0,
        badges: [],
        paidStreakMonths: [],
        photoBonusUrls: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return doc as UserStatsDoc;
}

export function newVisitDoc(
  userId: string,
  exhibitionUrl: string,
  title: string,
  conversationId?: string
): VisitDoc {
  const now = new Date();
  return {
    _id: randomUUID(),
    userId,
    exhibitionUrl,
    title,
    ...(conversationId ? { conversationId } : {}),
    visitedAt: now,
    monthKey: monthKeyOf(now),
    createdAt: now,
  };
}

/** Plain insert — caller catches MongoServerError code 11000 (already collected). */
export async function insertVisit(doc: VisitDoc): Promise<void> {
  const db = await getDb();
  await db.collection<VisitDoc>(VISITS).insertOne(doc);
}

/** Returns the deleted doc (for photo cleanup) or null when not found / not owned. */
export async function deleteVisit(userId: string, id: string): Promise<VisitDoc | null> {
  const db = await getDb();
  return db.collection<VisitDoc>(VISITS).findOneAndDelete({ _id: id, userId });
}

/** Atomic points increment; returns the new total. */
export async function incPoints(userId: string, delta: number): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const doc = await db.collection<UserStatsDoc>(STATS).findOneAndUpdate(
    { _id: userId },
    {
      $inc: { points: delta },
      $set: { updatedAt: now },
      $setOnInsert: { badges: [], paidStreakMonths: [], photoBonusUrls: [], createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return doc?.points ?? 0;
}

/** Awards a badge + bonus at most once per user. Returns true iff it actually paid. */
export async function awardBadgeOnce(
  userId: string,
  badgeId: string,
  bonus: number,
  earnedAt: Date
): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<UserStatsDoc>(STATS).updateOne(
    { _id: userId, 'badges.id': { $ne: badgeId } },
    {
      $push: { badges: { id: badgeId, earnedAt } },
      $inc: { points: bonus },
      $set: { updatedAt: earnedAt },
    }
  );
  return result.modifiedCount === 1;
}

/** Pays the streak bonus for a month at most once. Returns true iff it actually paid. */
export async function payStreakMonthOnce(
  userId: string,
  monthKey: string,
  bonus: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<UserStatsDoc>(STATS).updateOne(
    { _id: userId, paidStreakMonths: { $ne: monthKey } },
    {
      $addToSet: { paidStreakMonths: monthKey },
      $inc: { points: bonus },
      $set: { updatedAt: new Date() },
    }
  );
  return result.modifiedCount === 1;
}

/** Pays the photo bonus for an exhibition URL at most once. Returns true iff it actually paid. */
export async function payPhotoBonusOnce(
  userId: string,
  exhibitionUrl: string,
  bonus: number
): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<UserStatsDoc>(STATS).updateOne(
    { _id: userId, photoBonusUrls: { $ne: exhibitionUrl } },
    {
      $addToSet: { photoBonusUrls: exhibitionUrl },
      $inc: { points: bonus },
      $set: { updatedAt: new Date() },
    }
  );
  return result.modifiedCount === 1;
}

export async function setVisitPhoto(
  userId: string,
  id: string,
  photo: { url: string; thumbnailUrl?: string } | null
): Promise<VisitDoc | null> {
  const db = await getDb();
  return db.collection<VisitDoc>(VISITS).findOneAndUpdate(
    { _id: id, userId },
    photo ? { $set: { photo } } : { $unset: { photo: '' } },
    { returnDocument: 'after' }
  );
}

export async function getStats(userId: string): Promise<UserStatsDoc | null> {
  const db = await getDb();
  return db.collection<UserStatsDoc>(STATS).findOne({ _id: userId });
}
