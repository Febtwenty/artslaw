import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import {
  VISIT_POINTS,
  PHOTO_POINTS,
  STREAK_MONTH_POINTS,
  BADGES,
  monthKeyOf,
  levelForPoints,
  computeStreak,
  eligibleBadges,
} from '../config/gamification';
import {
  getVisits,
  getVisit,
  getStats,
  ensureStats,
  newVisitDoc,
  insertVisit,
  deleteVisit,
  incPoints,
  awardBadgeOnce,
  payStreakMonthOnce,
  payPhotoBonusOnce,
  setVisitPhoto,
  VisitDoc,
} from '../db/visits';

const router = Router();

function h(fn: RequestHandler): RequestHandler {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// ---------------------------------------------------------------------------
// Photo upload (multer) — mirrors the blog cover-image pipeline
// ---------------------------------------------------------------------------

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/visits');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  },
});

function deleteUploadedFile(url: string): void {
  if (!url.startsWith('/uploads/visits/')) return;
  fs.unlink(path.join(UPLOADS_DIR, path.basename(url)), () => {});
}

async function processAndSavePhoto(buffer: Buffer): Promise<string> {
  const name = `${randomUUID()}.webp`;
  // .rotate() with no args auto-corrects EXIF orientation (essential for phone photos)
  await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toFile(path.join(UPLOADS_DIR, name));
  return `/uploads/visits/${name}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toClientVisit(d: VisitDoc) {
  return {
    id: d._id,
    exhibitionUrl: d.exhibitionUrl,
    title: d.title,
    conversationId: d.conversationId ?? null,
    visitedAt: d.visitedAt,
    monthKey: d.monthKey,
    photoUrl: d.photo?.url ?? null,
  };
}

function levelUpBetween(before: number, after: number): { from: string; to: string } | null {
  const a = levelForPoints(before);
  const b = levelForPoints(after);
  return b.index > a.index ? { from: a.title, to: b.title } : null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/visits — full gamification state
router.get('/', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const [visits, stats] = await Promise.all([getVisits(userId), getStats(userId)]);
  res.json({
    visits: visits.map(toClientVisit),
    points: stats?.points ?? 0,
    badges: stats?.badges ?? [],
  });
}));

// POST /api/visits — collect an exhibition
router.post('/', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const exhibitionUrl = typeof req.body.exhibitionUrl === 'string' ? req.body.exhibitionUrl.trim() : '';
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const conversationId = typeof req.body.conversationId === 'string' ? req.body.conversationId : undefined;

  let hostname: string;
  try {
    hostname = new URL(exhibitionUrl).hostname;
  } catch {
    res.status(400).json({ error: 'A valid exhibitionUrl is required.' }); return;
  }

  await ensureStats(userId);

  const visit = newVisitDoc(userId, exhibitionUrl, title || hostname, conversationId);
  try {
    await insertVisit(visit);
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).json({ error: 'Already collected.', alreadyCollected: true }); return;
    }
    throw err;
  }

  const visits = await getVisits(userId);
  const monthKey = visit.monthKey;
  const visitsInMonth = visits.filter(v => v.monthKey === monthKey).length;
  const prevMonth = monthKeyOf(new Date(Date.UTC(
    Number(monthKey.slice(0, 4)),
    Number(monthKey.slice(5, 7)) - 2,
    1
  )));
  const prevMonthHasVisit = visits.some(v => v.monthKey === prevMonth);

  const newBadges: { id: string; earnedAt: Date }[] = [];
  let bonusPoints = 0;
  for (const badgeId of eligibleBadges(visits.length, visitsInMonth)) {
    const badge = BADGES.find(b => b.id === badgeId)!;
    if (await awardBadgeOnce(userId, badgeId, badge.points, visit.visitedAt)) {
      newBadges.push({ id: badgeId, earnedAt: visit.visitedAt });
      bonusPoints += badge.points;
    }
  }

  let streakBonusPaid = false;
  if (prevMonthHasVisit) {
    streakBonusPaid = await payStreakMonthOnce(userId, monthKey, STREAK_MONTH_POINTS);
    if (streakBonusPaid) bonusPoints += STREAK_MONTH_POINTS;
  }

  const totalPoints = await incPoints(userId, VISIT_POINTS);
  const pointsDelta = VISIT_POINTS + bonusPoints;

  res.status(201).json({
    visit: toClientVisit(visit),
    pointsDelta,
    totalPoints,
    newBadges,
    streak: computeStreak(visits.map(v => v.monthKey), new Date()),
    streakBonusPaid,
    levelUp: levelUpBetween(totalPoints - pointsDelta, totalPoints),
  });
}));

// DELETE /api/visits/:id — un-collect (bonuses stay; only the visit's own points go)
router.delete('/:id', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const deleted = await deleteVisit(userId, req.params.id);
  if (!deleted) { res.status(404).json({ error: 'Visit not found.' }); return; }

  if (deleted.photo) deleteUploadedFile(deleted.photo.url);
  const totalPoints = await incPoints(userId, -VISIT_POINTS);

  res.json({ totalPoints, pointsDelta: -VISIT_POINTS });
}));

// POST /api/visits/:id/photo — upload/replace the visit photo
router.post('/:id/photo', upload.single('photo'), h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  if (!req.file) {
    res.status(400).json({ error: 'An image file (JPEG, PNG, or WebP) is required.' }); return;
  }

  const visit = await getVisit(userId, req.params.id);
  if (!visit) { res.status(404).json({ error: 'Visit not found.' }); return; }

  const url = await processAndSavePhoto(req.file.buffer);
  if (visit.photo) deleteUploadedFile(visit.photo.url); // replacement — no points
  const updated = await setVisitPhoto(userId, visit._id, { url });
  if (!updated) {
    // Visit was un-collected mid-upload; don't leave an orphaned file behind
    deleteUploadedFile(url);
    res.status(404).json({ error: 'Visit not found.' }); return;
  }

  const bonusPaid = await payPhotoBonusOnce(userId, visit.exhibitionUrl, PHOTO_POINTS);
  const stats = await getStats(userId);
  const totalPoints = stats?.points ?? 0;
  const pointsDelta = bonusPaid ? PHOTO_POINTS : 0;

  res.json({
    visit: toClientVisit(updated),
    pointsDelta,
    totalPoints,
    levelUp: bonusPaid ? levelUpBetween(totalPoints - pointsDelta, totalPoints) : null,
  });
}));

// DELETE /api/visits/:id/photo — remove the photo (points earned stay)
router.delete('/:id/photo', h(async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required.' }); return; }

  const visit = await getVisit(userId, req.params.id);
  if (!visit) { res.status(404).json({ error: 'Visit not found.' }); return; }

  if (visit.photo) deleteUploadedFile(visit.photo.url);
  const updated = await setVisitPhoto(userId, visit._id, null);
  if (!updated) { res.status(404).json({ error: 'Visit not found.' }); return; }

  res.json({ visit: toClientVisit(updated) });
}));

// Multer v2 error handler — catches MulterError (wrong type, size limit) from upload.single()
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload failed: ${err.message}` }); return;
  }
  next(err);
});

router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[visits]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default router;
