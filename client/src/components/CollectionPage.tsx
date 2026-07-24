import { useRef, useState } from 'react';
import {
  BADGES,
  VISIT_POINTS,
  levelForPoints,
  computeStreak,
  monthKeyOf,
} from '../lib/gamification';
import type { Visit, EarnedBadge } from '../lib/gamification';
import type { Conversation } from '../types';

interface Props {
  visits: Visit[];
  points: number;
  badges: EarnedBadge[];
  conversations: Conversation[];
  onReopenTour: (conversationId: string) => void;
  onStartTour: () => void;
  onUncollect: (visitId: string) => Promise<void>;
  onUploadPhoto: (visitId: string, file: File) => Promise<{ pointsDelta: number } | null>;
  onRemovePhoto: (visitId: string) => Promise<void>;
}

function monthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function visitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function badgeProgress(badgeId: string, visits: Visit[]): string {
  const total = visits.length;
  const maxInMonth = visits.reduce<Record<string, number>>((acc, v) => {
    acc[v.monthKey] = (acc[v.monthKey] ?? 0) + 1;
    return acc;
  }, {});
  const best = Math.max(0, ...Object.values(maxInMonth));
  switch (badgeId) {
    case 'first_visit': return `${Math.min(total, 1)}/1 exhibition`;
    case 'visits_5': return `${Math.min(total, 5)}/5 exhibitions`;
    case 'visits_10': return `${Math.min(total, 10)}/10 exhibitions`;
    case 'visits_20': return `${Math.min(total, 20)}/20 exhibitions`;
    case 'month_3': return `${Math.min(best, 3)}/3 in one month`;
    default: return '';
  }
}

export default function CollectionPage({
  visits,
  points,
  badges,
  conversations,
  onReopenTour,
  onStartTour,
  onUncollect,
  onUploadPhoto,
  onRemovePhoto,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhotoVisit, setPendingPhotoVisit] = useState<string | null>(null);

  const level = levelForPoints(points);
  const pct = level.next
    ? Math.min(100, Math.round(((points - level.min) / (level.next.min - level.min)) * 100))
    : 100;

  const now = new Date();
  const currentMonthKey = monthKeyOf(now);
  const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const streak = computeStreak(visits.map(v => v.monthKey), now);
  const hasCollectThisMonth = visits.some(v => v.monthKey === currentMonthKey);

  const months = [...new Set(visits.map(v => v.monthKey))].sort().reverse();

  const pickPhoto = (visitId: string) => {
    setPendingPhotoVisit(visitId);
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingPhotoVisit) return;
    await onUploadPhoto(pendingPhotoVisit, file);
    setPendingPhotoVisit(null);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Stats hero                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-10">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h1 className="font-serif text-3xl text-slate-900 dark:text-slate-100">{level.title}</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium">
            🔥 {streak > 0 ? `${streak}-month streak` : 'No streak yet'}
          </span>
        </div>

        <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          {level.next ? (
            <>
              <span>{points} / {level.next.min} pts</span>
              <span>{level.next.min - points} pts to {level.next.title}</span>
            </>
          ) : (
            <>
              <span>{points} pts</span>
              <span>Top level reached</span>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          {streak === 0
            ? 'Start a streak — collect an exhibition this month.'
            : !hasCollectThisMonth
              ? `Collect an exhibition in ${currentMonthName} to keep your streak.`
              : `Streak alive — see you next month!`}
        </p>

        {/* Badge shelf */}
        <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
          {BADGES.map(badge => {
            const earned = badges.find(b => b.id === badge.id);
            return (
              <div
                key={badge.id}
                title={earned ? `Earned ${visitDate(String(earned.earnedAt))}` : badge.hint}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center ${
                  earned
                    ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30'
                    : 'border-slate-200 dark:border-slate-700 grayscale opacity-40'
                }`}
              >
                <span className="text-xl leading-none">{badge.emoji}</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">{badge.name}</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
                  {earned ? `+${badge.points} pts` : badgeProgress(badge.id, visits)}
                </span>
              </div>
            );
          })}
          {/* Streak tile (not earnable — live counter) */}
          <div
            title="Consecutive months with at least one collected exhibition"
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-center ${
              streak > 0
                ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30'
                : 'border-slate-200 dark:border-slate-700 grayscale opacity-40'
            }`}
          >
            <span className="text-xl leading-none">🔥</span>
            <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">Streak</span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight">
              {streak > 0 ? `${streak} month${streak > 1 ? 's' : ''}` : 'Collect monthly'}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Timeline / empty state                                              */}
      {/* ------------------------------------------------------------------ */}
      {visits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎟️</div>
          <p className="text-slate-500 dark:text-slate-400 mb-6">
            Your collection is empty — take a tour and stamp your first visit.
          </p>
          <button
            onClick={onStartTour}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors shadow-sm"
          >
            Start a tour
          </button>
        </div>
      ) : (
        months.map(monthKey => (
          <div key={monthKey} className="mb-8">
            <h2 className="font-serif text-lg text-slate-700 dark:text-slate-300 mb-4">{monthLabel(monthKey)}</h2>
            <div className="border-l-2 border-slate-200 dark:border-slate-700 pl-5 space-y-4">
              {visits
                .filter(v => v.monthKey === monthKey)
                .map(visit => {
                  const hasConversation =
                    !!visit.conversationId && conversations.some(c => c.id === visit.conversationId);
                  return (
                    <div key={visit.id} className="relative group">
                      <span className="absolute -left-[27px] top-4 w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <div className="flex gap-3 items-start p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {/* Thumbnail: photo or favicon */}
                        <div className="relative flex-shrink-0">
                          {visit.photoUrl ? (
                            <>
                              <img
                                src={visit.photoUrl}
                                alt={`Your photo of ${visit.title}`}
                                className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => pickPhoto(visit.id)}
                                title="Replace photo"
                              />
                              <button
                                onClick={() => onRemovePhoto(visit.id)}
                                title="Remove photo"
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-600 text-white text-[9px] leading-none flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => pickPhoto(visit.id)}
                              title="Add a photo of your visit"
                              className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-400 transition-colors"
                            >
                              <img
                                src={`/api/favicon?domain=${encodeURIComponent(hostnameOf(visit.exhibitionUrl))}`}
                                alt=""
                                className="w-5 h-5 mb-0.5"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <span className="text-[9px]">📷 add</span>
                            </button>
                          )}
                        </div>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="font-serif text-sm text-slate-900 dark:text-slate-100 truncate">
                            {visit.title}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                            {hostnameOf(visit.exhibitionUrl)} · {visitDate(visit.visitedAt)}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-medium">
                              +{VISIT_POINTS} pts
                            </span>
                            {hasConversation && (
                              <button
                                onClick={() => onReopenTour(visit.conversationId!)}
                                className="text-[11px] text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                              >
                                Reopen tour →
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Un-collect */}
                        <button
                          onClick={() => onUncollect(visit.id)}
                          title="Un-collect this exhibition"
                          className="flex-shrink-0 p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
