import { useState } from 'react';

interface Props {
  onStart: (url: string) => void;
}

export default function ExhibitionLinkInput({ onStart }: Props) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onStart(trimmed);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      {/* Ornamental top rule */}
      <div className="flex items-center gap-4 mb-10 w-full max-w-sm">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-800/50" />
        <span className="text-amber-700 text-xs tracking-[0.3em] uppercase font-light">ArtGuide</span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-800/50" />
      </div>

      <h2 className="font-serif text-4xl md:text-5xl font-semibold text-amber-50 leading-tight mb-5">
        Discover the Story<br />
        <em className="font-normal text-amber-200">Behind the Art</em>
      </h2>

      <p className="text-stone-400 text-base font-light max-w-md leading-relaxed mb-10">
        Paste a link to any gallery or museum exhibition. I'll research it and guide you through the artist, the works, and the ideas — like a personal gallery tour.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.moma.org/exhibitions/..."
              className="w-full bg-stone-900 border border-stone-700 rounded-xl px-4 py-3.5 pr-12 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-700 focus:ring-1 focus:ring-amber-700/50 transition-all font-light text-sm"
            />
            {/* Link icon */}
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600"
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
            className="w-full bg-amber-800 hover:bg-amber-700 disabled:bg-stone-800 disabled:text-stone-600 disabled:cursor-not-allowed text-amber-50 rounded-xl px-6 py-3.5 font-medium transition-all tracking-wide text-sm"
          >
            Begin the Tour
          </button>
        </div>

        <p className="text-stone-600 text-xs mt-4 font-light">
          Works with museum sites, gallery pages, or any exhibition URL
        </p>
      </form>

      {/* Ornamental bottom rule */}
      <div className="flex items-center gap-4 mt-12 w-full max-w-sm">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-stone-800" />
        <div className="w-1 h-1 rounded-full bg-stone-700" />
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-stone-800" />
      </div>
    </div>
  );
}
