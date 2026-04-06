import { useState } from 'react';
import LogoWordmark from './LogoWordmark';

interface Props {
  onStart: (url: string) => void;
  initialUrl?: string;
  language: 'en' | 'de';
  onLanguageChange: (lang: 'en' | 'de') => void;
}

export default function ExhibitionLinkInput({ onStart, initialUrl, language, onLanguageChange }: Props) {
  const [url, setUrl] = useState(initialUrl ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
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
    </div>
  );
}
