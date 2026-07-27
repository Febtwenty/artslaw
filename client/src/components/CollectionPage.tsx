import { useEffect, useRef, useState } from 'react';
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
  const [collectionView, setCollectionView] = useState<'grid' | 'timeline'>(
    () => (localStorage.getItem('collectionView') === 'timeline' ? 'timeline' : 'grid'),
  );
  const [lightboxVisitId, setLightboxVisitId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('collectionView', collectionView);
  }, [collectionView]);

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

  const gridVisits = [...visits].sort(
    (a, b) => +new Date(b.visitedAt) - +new Date(a.visitedAt),
  );

  const hasConversationFor = (visit: Visit) =>
    !!visit.conversationId && conversations.some(c => c.id === visit.conversationId);

  const lightboxVisit = lightboxVisitId
    ? visits.find(v => v.id === lightboxVisitId) ?? null
    : null;

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
      {/* View toggle                                                         */}
      {/* ------------------------------------------------------------------ */}
      {visits.length > 0 && (
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={() => setCollectionView('grid')}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={collectionView === 'grid'}
            className={`transition-colors ${
              collectionView === 'grid'
                ? 'text-indigo-500'
                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3 3h7.5v7.5H3V3Zm10.5 0H21v7.5h-7.5V3ZM3 13.5h7.5V21H3v-7.5Zm10.5 0H21V21h-7.5v-7.5Z" />
            </svg>
          </button>
          <button
            onClick={() => setCollectionView('timeline')}
            title="Timeline view"
            aria-label="Timeline view"
            aria-pressed={collectionView === 'timeline'}
            className={`transition-colors ${
              collectionView === 'timeline'
                ? 'text-indigo-500'
                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-5 h-5">
              <path d="M5 3v18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <circle cx="5" cy="7" r="2.25" fill="currentColor" />
              <circle cx="5" cy="17" r="2.25" fill="currentColor" />
              <path d="M10 7h9M10 17h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Empty state / Grid / Timeline                                       */}
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
      ) : collectionView === 'grid' ? (
        <div className="grid grid-cols-3 gap-0.5 sm:gap-4">
          {gridVisits.map(visit => {
            const hasConversation = hasConversationFor(visit);
            return (
              <div
                key={visit.id}
                className="group relative sm:rounded-xl sm:border sm:border-slate-200 sm:dark:border-slate-700 sm:bg-white sm:dark:bg-slate-800 sm:overflow-hidden"
              >
                {/* Image area */}
                <div className="relative">
                  {visit.photoUrl ? (
                    <>
                      <img
                        src={visit.photoThumbnailUrl ?? visit.photoUrl}
                        alt={`Your photo of ${visit.title}`}
                        loading="lazy"
                        onClick={() => pickPhoto(visit.id)}
                        title="Replace photo"
                        className="w-full aspect-square object-cover cursor-pointer"
                      />
                      <button
                        onClick={() => onRemovePhoto(visit.id)}
                        title="Remove photo"
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/60 text-white text-xs leading-none hidden sm:group-hover:flex items-center justify-center"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <div
                      onClick={() => pickPhoto(visit.id)}
                      title="Add a photo of your visit"
                      className="w-full aspect-square flex flex-col items-center justify-center cursor-pointer bg-gradient-to-br from-indigo-100 to-slate-200 dark:from-indigo-900/30 dark:to-slate-700 text-slate-400 hover:text-indigo-500 transition-colors"
                    >
                      <img
                        src={`/api/favicon?domain=${encodeURIComponent(hostnameOf(visit.exhibitionUrl))}`}
                        alt=""
                        className="w-6 h-6 mb-1"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <span className="text-[10px]">📷 add</span>
                    </div>
                  )}
                  {/* Mobile: tap opens lightbox (hidden on desktop so image click = replace) */}
                  <button
                    type="button"
                    aria-label={`Open ${visit.title}`}
                    onClick={() => setLightboxVisitId(visit.id)}
                    className="absolute inset-0 sm:hidden"
                  />
                </div>

                {/* Desktop caption body */}
                <div className="hidden sm:flex flex-col gap-1 px-3 py-2.5">
                  <div className="font-serif text-sm text-slate-900 dark:text-slate-100 truncate">
                    {visit.title}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {hostnameOf(visit.exhibitionUrl)} · {visitDate(visit.visitedAt)}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-medium shrink-0">
                        +{VISIT_POINTS} pts
                      </span>
                      {hasConversation && (
                        <button
                          onClick={() => onReopenTour(visit.conversationId!)}
                          className="text-[11px] text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors truncate"
                        >
                          Reopen tour →
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => onUncollect(visit.id)}
                      title="Un-collect this exhibition"
                      className="shrink-0 p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors md:opacity-0 md:group-hover:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
                      <span className="absolute -left-[26px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      <div className="flex gap-3 items-start p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        {/* Thumbnail: photo or favicon */}
                        <div className="relative flex-shrink-0">
                          {visit.photoUrl ? (
                            <>
                              <img
                                src={visit.photoThumbnailUrl ?? visit.photoUrl}
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

      {/* ------------------------------------------------------------------ */}
      {/* Mobile lightbox                                                     */}
      {/* ------------------------------------------------------------------ */}
      {lightboxVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 sm:hidden"
          onClick={() => setLightboxVisitId(null)}
        >
          <div
            className="relative w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxVisitId(null)}
              aria-label="Close"
              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg leading-none"
            >
              ×
            </button>

            {lightboxVisit.photoUrl ? (
              <img
                src={lightboxVisit.photoUrl}
                alt={`Your photo of ${lightboxVisit.title}`}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-200 dark:from-indigo-900/30 dark:to-slate-700">
                <img
                  src={`/api/favicon?domain=${encodeURIComponent(hostnameOf(lightboxVisit.exhibitionUrl))}`}
                  alt=""
                  className="w-10 h-10"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}

            <div className="p-4 flex flex-col gap-3">
              <div>
                <div className="font-serif text-base text-slate-900 dark:text-slate-100">
                  {lightboxVisit.title}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {hostnameOf(lightboxVisit.exhibitionUrl)} · {visitDate(lightboxVisit.visitedAt)}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-medium">
                  +{VISIT_POINTS} pts
                </span>
                {hasConversationFor(lightboxVisit) && (
                  <button
                    onClick={() => onReopenTour(lightboxVisit.conversationId!)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
                  >
                    Reopen tour →
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={() => pickPhoto(lightboxVisit.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  {lightboxVisit.photoUrl ? 'Replace photo' : '📷 Add photo'}
                </button>
                {lightboxVisit.photoUrl && (
                  <button
                    onClick={() => onRemovePhoto(lightboxVisit.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-red-400 hover:text-red-500 transition-colors"
                  >
                    Remove photo
                  </button>
                )}
                <button
                  onClick={async () => {
                    const id = lightboxVisit.id;
                    setLightboxVisitId(null);
                    await onUncollect(id);
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Un-collect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
