import { useState } from 'react';
import LogoWordmark from './LogoWordmark';
import type { SuggestedTour } from '../App';

interface Props {
  onStart: (url: string) => void;
  initialUrl?: string;
  language: 'en' | 'de';
  onLanguageChange: (lang: 'en' | 'de') => void;
  suggestedTours?: SuggestedTour[];
}

export default function ExhibitionLinkInput({ onStart, initialUrl, language, onLanguageChange, suggestedTours }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-10">
      {/* Wordmark */}
      <div className="mb-8">
        <LogoWordmark className="h-12 w-auto" />
      </div>

      <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-slate-100 leading-tight mb-4">
        Discover the Story<br />
        <span className="text-indigo-600">Behind the Art</span>
      </h2>

      <p className="text-slate-500 dark:text-slate-400 text-base max-w-md leading-relaxed mb-10">
        Paste a link to any gallery or museum exhibition. ArtSlaw will research it and walk you through the artist, the works, and the ideas.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.moma.org/exhibitions/..."
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3.5 pr-12 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all text-base md:text-sm shadow-sm"
            />
            {/* Link icon */}
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
              />
            </svg>
          </div>

          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl px-6 py-3.5 font-medium transition-all text-sm shadow-sm"
          >
            Begin the Tour
          </button>
        </div>

        <p className="text-slate-400 dark:text-slate-500 text-xs mt-4 flex items-center justify-center gap-2">
          <span>Works with museum sites, gallery pages, or any exhibition URL</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <button
            type="button"
            onClick={() => onLanguageChange('en')}
            className={`transition-colors ${language === 'en' ? 'text-slate-600 dark:text-slate-300 font-medium' : 'hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            English
          </button>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <button
            type="button"
            onClick={() => onLanguageChange('de')}
            className={`transition-colors ${language === 'de' ? 'text-slate-600 dark:text-slate-300 font-medium' : 'hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Deutsch
          </button>
        </p>
      </form>

      {suggestedTours && suggestedTours.length > 0 && (
        <div className="mt-10 w-full max-w-xl">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
            Or explore a featured exhibition
          </p>
          <div className="flex flex-col gap-2.5">
            {suggestedTours.map((tour, i) => (
              <div
                key={tour.url ?? i}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {tour.imageUrl ? (
                    <img
                      src={tour.imageUrl}
                      alt={tour.exhibitionTitle}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 to-slate-200 dark:from-indigo-900/30 dark:to-slate-700 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    {tour.artistName && (
                      <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate text-left">
                        {tour.artistName}
                      </p>
                    )}
                    <a
                      href={tour.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2 leading-snug text-left transition-colors"
                    >
                      {tour.exhibitionTitle || 'Untitled Exhibition'}
                    </a>
                    {tour.gallery && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate text-left">{tour.gallery}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStart(tour.url)}
                  className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
                >
                  Start Tour
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
