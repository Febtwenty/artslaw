import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';

interface Discovery {
  _id?: string;
  artistName: string;
  exhibitionTitle: string;
  gallery: string;
  city: string;
  dates: string;
  url: string;
  scrapedAt: string;
  imageUrl?: string | null;
}

interface Props {
  onStartTour: (url: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DiscoverPage({ onStartTour }: Props) {
  const { getToken } = useAuth();
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVisibleCount(6);
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/discoveries', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load discoveries (${res.status})`);
        const data: Discovery[] = await res.json();
        if (!cancelled) setDiscoveries(shuffle(data));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  // Progressive reveal: load 3 more when sentinel enters viewport
  useEffect(() => {
    if (!sentinelRef.current || visibleCount >= discoveries.length) return;
    const sentinel = sentinelRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((n) => Math.min(n + 3, discoveries.length));
    }, { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [discoveries.length, visibleCount]);

  const visible = discoveries.slice(0, visibleCount);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 py-16 justify-center">
        <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Researching exhibitions&hellip;</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (discoveries.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
          No discoveries yet. Start a tour to get recommendations based on artists you've explored.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 max-w-5xl mx-auto w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((d, i) => (
          <div
            key={d._id ? String(d._id) : `${d.url}-${i}`}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col"
          >
            {d.imageUrl ? (
              <img
                src={d.imageUrl}
                alt={d.exhibitionTitle || d.artistName}
                className="w-full aspect-square object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full aspect-square bg-gradient-to-br from-indigo-100 to-slate-200 dark:from-indigo-900/30 dark:to-slate-700 flex items-center justify-center">
                <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </div>
            )}
            <div className="px-3 py-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate">
                  {d.artistName}
                </span>
                {d.dates && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{d.dates}</span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-1">
                {d.exhibitionTitle || 'Untitled Exhibition'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {[d.gallery, d.city].filter(Boolean).join(' · ')}
              </p>
              <div className="pt-1.5 flex items-center justify-between gap-2">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                >
                  View on CAL &rarr;
                </a>
                <button
                  onClick={() => onStartTour(d.url)}
                  className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1 transition-colors"
                >
                  Start Tour
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {visibleCount < discoveries.length && (
        <div ref={sentinelRef} className="h-4 mt-4" aria-hidden="true" />
      )}
    </div>
  );
}
