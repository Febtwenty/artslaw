import { getDb } from '../db';

const FEEDBACK = 'message_feedback';

export type Rating = 'up' | 'down';

export interface FeedbackDoc {
  userId: string;
  messageId: string;
  rating: Rating;
  reason?: string;
  comment?: string;
  provider: 'claude' | 'mistral';
  exhibitionUrl?: string;
  conversationId?: string;
  messageText: string;
  userPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function ensureFeedbackIndexes(): Promise<void> {
  const db = await getDb();
  const col = db.collection(FEEDBACK);
  await col.createIndex({ userId: 1, messageId: 1 }, { unique: true });
}

export interface FeedbackInput {
  rating: Rating;
  reason?: string;
  comment?: string;
  provider: 'claude' | 'mistral';
  exhibitionUrl?: string;
  conversationId?: string;
  messageText: string;
  userPrompt?: string;
}

const MAX_TEXT = 4000;

/**
 * Upserts one rating per (userId, messageId). Switching to 'up' clears any
 * reason/comment left over from a previous down-vote.
 */
export async function upsertFeedback(
  userId: string,
  messageId: string,
  input: FeedbackInput
): Promise<void> {
  const db = await getDb();
  const now = new Date();

  const set: Record<string, unknown> = {
    rating: input.rating,
    provider: input.provider,
    messageText: input.messageText.slice(0, MAX_TEXT),
    updatedAt: now,
  };
  if (input.exhibitionUrl) set.exhibitionUrl = input.exhibitionUrl;
  if (input.conversationId) set.conversationId = input.conversationId;
  if (input.userPrompt) set.userPrompt = input.userPrompt.slice(0, MAX_TEXT);

  const unset: Record<string, ''> = {};
  if (input.rating === 'down') {
    if (input.reason !== undefined) set.reason = input.reason; else unset.reason = '';
    if (input.comment) set.comment = input.comment.slice(0, MAX_TEXT); else unset.comment = '';
  } else {
    // 'up' carries no reason/comment
    unset.reason = '';
    unset.comment = '';
  }

  await db.collection<FeedbackDoc>(FEEDBACK).updateOne(
    { userId, messageId },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
      $setOnInsert: { userId, messageId, createdAt: now },
    },
    { upsert: true }
  );
}

/** Toggle-off: remove the rating entirely. */
export async function deleteFeedback(userId: string, messageId: string): Promise<void> {
  const db = await getDb();
  await db.collection<FeedbackDoc>(FEEDBACK).deleteOne({ userId, messageId });
}
