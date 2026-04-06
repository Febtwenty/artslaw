import { useClerk } from '@clerk/react';

interface Props {
  isDark: boolean;
  onToggleDark: () => void;
  navigate: (path: string) => void;
}

export default function SignInPage({ isDark, onToggleDark, navigate }: Props) {
  const { openSignIn } = useClerk();

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Minimal header */}
      <header className="flex-shrink-0 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Inline logo */}
          <svg viewBox="0 0 32 32" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="28" height="28" rx="3" fill="#1e293b" />
            <rect x="5" y="5" width="22" height="22" rx="1.5" fill="#f8fafc" />
            <rect x="7" y="7" width="18" height="9" rx="1" fill="#818cf8" />
            <rect x="7" y="16" width="18" height="9" rx="0" fill="#6366f1" />
            <circle cx="16" cy="13" r="3.5" fill="#fde68a" />
          </svg>
          <span className="text-slate-900 dark:text-slate-100 font-semibold text-base">ArtSlaw</span>
        </div>
        <button
          onClick={onToggleDark}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-16">
        {/* Large art icon */}
        <div className="mb-10">
          <svg viewBox="0 0 64 64" className="w-16 h-16 drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="60" height="60" rx="8" fill="#1e293b" />
            <rect x="7" y="7" width="50" height="50" rx="4" fill="#f8fafc" />
            <rect x="11" y="11" width="42" height="42" rx="2" fill="#e2e8f0" />
            <rect x="11" y="11" width="42" height="21" rx="2" fill="#818cf8" />
            <rect x="11" y="32" width="42" height="21" rx="0" fill="#6366f1" />
            <circle cx="32" cy="26" r="8" fill="#fde68a" />
          </svg>
        </div>

        {/* Headline */}
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-slate-900 dark:text-slate-50 leading-tight max-w-lg mb-5">
          Discover the Story<br />
          <span className="text-indigo-600">Behind the Art</span>
        </h1>

        {/* Subtitle */}
        <p className="text-slate-500 dark:text-slate-400 text-base md:text-lg max-w-md leading-relaxed mb-10">
          Paste a link to any gallery or museum exhibition. ArtSlaw researches it and walks you through the artist, the works, and the ideas.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {[
            'Any public exhibition',
            'Deep research',
            'Conversational tour',
          ].map((label) => (
            <span
              key={label}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm"
            >
              {label}
            </span>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={() => openSignIn()}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-base shadow-sm transition-colors"
        >
          Get Started
        </button>
        <p className="text-slate-400 dark:text-slate-500 text-xs mt-3">
          Sign up with your email — free to use
        </p>

        {/* Product demo preview */}
        <div className="mt-16 w-full max-w-2xl mx-auto">
          <p className="text-xs font-medium tracking-widest uppercase text-slate-400 dark:text-slate-500 mb-4 text-center">
            See it in action
          </p>
          {/* Browser frame */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="flex-1 text-center text-xs text-slate-400 dark:text-slate-500 font-mono truncate">
                artslaw.io/tour/marlene-dumas-tate-modern
              </span>
            </div>
            {/* Chat messages */}
            <div className="p-4 flex flex-col gap-3">
              {/* User message */}
              <div className="self-end bg-indigo-600 text-white rounded-xl rounded-br-sm px-4 py-2.5 text-sm max-w-xs">
                Tell me about the main works in this show
              </div>
              {/* Assistant message 1 */}
              <div className="self-start bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm max-w-sm leading-relaxed">
                The centrepiece is Marlene Dumas's <em>The Visitor</em> (2023) — a large-scale oil on canvas that confronts the viewer with an unflinching gaze. Dumas works primarily from photographs, and here the source image is deliberately withheld, leaving the subject's identity open. Her loose, gestural brushwork creates a tension between intimacy and unease that runs through the whole exhibition.
              </div>
              {/* Assistant message 2 */}
              <div className="self-start bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl rounded-tl-sm px-4 py-2.5 text-sm max-w-sm leading-relaxed">
                The show also includes <em>Names</em> (1997), a grid of 100 small portraits of children painted from newspaper images — each face rendered with just a few strokes but unmistakably present. It's one of Dumas's earliest explorations of how images circulate and what gets lost in that process.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-4 text-center">
        <p className="text-slate-400 dark:text-slate-600 text-xs flex flex-wrap items-center justify-center gap-x-2">
          <span>&copy; {new Date().getFullYear()} ArtSlaw</span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <button onClick={() => navigate('/privacy')} className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Privacy</button>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <button onClick={() => navigate('/terms')} className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors">Terms</button>
        </p>
      </footer>
    </div>
  );
}
