import { useClerk } from '@clerk/react';
import { useState, useEffect, useRef } from 'react';
import LogoWordmark from './LogoWordmark';

// 0: user1 dots | 1: user1 msg + AI dots | 2: AI reply1 | 3: user2 dots | 4: user2 msg + AI dots | 5: AI reply2
const DELAYS = [900, 2000, 1500, 700, 2200, 0];

function AiDots() {
  return (
    <div className="self-start flex items-center gap-1 px-4 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl rounded-tl-sm">
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:200ms]" />
      <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:400ms]" />
    </div>
  );
}

function UserDots() {
  return (
    <div className="self-end flex items-center gap-1 px-4 py-3 bg-indigo-600 rounded-xl rounded-br-sm">
      <span className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce [animation-delay:200ms]" />
      <span className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce [animation-delay:400ms]" />
    </div>
  );
}

function ChatDemo() {
  const [step, setStep] = useState(-1);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          let s = 0;
          function next() {
            if (s > 5) return;
            setStep(s);
            if (s < 5) timerRef.current = setTimeout(next, DELAYS[s++]);
            else s++;
          }
          next();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step]);

  const fadeIn = 'transition-all duration-500 opacity-100 translate-y-0';
  const msg = (extra = '') => `px-4 py-2.5 text-sm leading-relaxed rounded-xl ${extra}`;

  return (
    <div ref={frameRef} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
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
      {/* Fixed-height scroll area */}
      <div ref={scrollRef} className="h-72 overflow-y-auto p-4 flex flex-col gap-3">
        {step >= 0 && step < 1 && <UserDots />}
        {step >= 1 && (
          <div className={`self-end max-w-xs text-white bg-indigo-600 rounded-br-sm ${msg(fadeIn)}`}>
            Please guide me through this exhibition.
          </div>
        )}
        {step === 1 && <AiDots />}
        {step >= 2 && (
          <div className={`self-start text-left max-w-sm text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 rounded-tl-sm ${msg(fadeIn)}`}>
            What a fascinating exhibition to explore! This major Tate Modern exhibition—titled after her 1993 work <em>The Image as Burden</em>—features over 100 paintings and drawings spanning her career, presenting intimate personal subjects alongside famous figures and politically charged moments, all rendered in her signature ghostly palette of grays, browns, and pinks.
          </div>
        )}
        {step >= 3 && step < 4 && <UserDots />}
        {step >= 4 && (
          <div className={`self-end max-w-xs text-white bg-indigo-600 rounded-br-sm ${msg(fadeIn)}`}>
            Why does this matter?
          </div>
        )}
        {step === 4 && <AiDots />}
        {step >= 5 && (
          <div className={`self-start text-left max-w-sm text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 rounded-tl-sm ${msg(fadeIn)}`}>
            In an era dominated by the mass media and a proliferation of images, her work is a testament to the meaning and potency of painting. We live drowning in images—on screens, in feeds, everywhere. Dumas is asking: what does a handmade, carefully considered painting mean in this world of endless digital reproduction? Why does touching oil paint and canvas still matter?
          </div>
        )}

      </div>
    </div>
  );
}

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
          <LogoWordmark className="h-6 w-auto" />
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
        {/* Wordmark */}
        <div className="mb-10">
          <LogoWordmark className="h-16 w-auto" />
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

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 w-full max-w-2xl">
          <div className="flex flex-col items-start gap-2 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-left">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Any public exhibition</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Paste a URL from any gallery or museum worldwide — if it's publicly listed, ArtSlaw can research it.</p>
          </div>
          <div className="flex flex-col items-start gap-2 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-left">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <circle cx="11" cy="11" r="7" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Deep research</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">ArtSlaw searches the web in real time so every tour reflects current, accurate information about the artist and works.</p>
          </div>
          <div className="flex flex-col items-start gap-2 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm text-left">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Conversational tour</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Ask follow-up questions naturally. Dive deeper into technique, biography, or related artists whenever you want.</p>
          </div>
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
          <ChatDemo />
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
