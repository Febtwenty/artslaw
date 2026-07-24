// ⚠ KEEP IN SYNC with client/src/lib/gamification.ts — levels/badges/points must match exactly.
// The server is authoritative for awarding points; the client copy is display-only.

export const VISIT_POINTS = 10;
export const PHOTO_POINTS = 5;
export const STREAK_MONTH_POINTS = 5;

export const LEVELS = [
  { title: 'Gallery Newcomer',   min: 0 },
  { title: 'Art Stroller',       min: 30 },
  { title: 'Vernissage Regular', min: 80 },
  { title: 'Connoisseur',        min: 160 },
  { title: 'Curator',            min: 280 },
  { title: 'Art-World Legend',   min: 450 },
] as const;

export const BADGES = [
  { id: 'first_visit', name: 'First Visit',    emoji: '🎟️', points: 5,  hint: 'Collect your first exhibition' },
  { id: 'visits_5',    name: '5 Exhibitions',  emoji: '🖼️', points: 10, hint: 'Collect 5 exhibitions' },
  { id: 'visits_10',   name: '10 Exhibitions', emoji: '🏛️', points: 15, hint: 'Collect 10 exhibitions' },
  { id: 'visits_20',   name: '20 Exhibitions', emoji: '👑', points: 25, hint: 'Collect 20 exhibitions' },
  { id: 'month_3',     name: 'Art Month',      emoji: '🔥', points: 10, hint: 'Collect 3 exhibitions in one month' },
] as const;

export type BadgeId = (typeof BADGES)[number]['id'];

export interface LevelInfo {
  index: number;
  title: string;
  min: number;
  next: { title: string; min: number } | null;
}

export function levelForPoints(points: number): LevelInfo {
  let index = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (points >= LEVELS[i].min) { index = i; break; }
  }
  const next = index + 1 < LEVELS.length ? LEVELS[index + 1] : null;
  return {
    index,
    title: LEVELS[index].title,
    min: LEVELS[index].min,
    next: next ? { title: next.title, min: next.min } : null,
  };
}

export function monthKeyOf(d: Date): string {
  return d.toISOString().slice(0, 7); // "YYYY-MM" (UTC)
}

function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return monthKeyOf(new Date(Date.UTC(y, m - 2, 1)));
}

/**
 * Consecutive calendar months each containing ≥1 visit, counted backwards from
 * the current month — or from the previous month when the current one has no
 * visit yet (the streak is "alive" until the current month ends).
 */
export function computeStreak(monthKeys: string[], now: Date): number {
  const months = new Set(monthKeys);
  const current = monthKeyOf(now);
  let cursor = months.has(current) ? current : prevMonthKey(current);
  let streak = 0;
  while (months.has(cursor)) {
    streak++;
    cursor = prevMonthKey(cursor);
  }
  return streak;
}

/** Badge ids whose thresholds are met after a new collect. Awarding stays idempotent server-side. */
export function eligibleBadges(totalVisits: number, visitsInMonth: number): BadgeId[] {
  const ids: BadgeId[] = [];
  if (totalVisits >= 1) ids.push('first_visit');
  if (totalVisits >= 5) ids.push('visits_5');
  if (totalVisits >= 10) ids.push('visits_10');
  if (totalVisits >= 20) ids.push('visits_20');
  if (visitsInMonth >= 3) ids.push('month_3');
  return ids;
}
