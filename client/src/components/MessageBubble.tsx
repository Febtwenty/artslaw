import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../App';

interface Props {
  message: Message;
  isLoading?: boolean;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .trim();
}

export default function MessageBubble({ message, isLoading }: Props) {
  const isUser = message.role === 'user';
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [copied, setCopied] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  };

  const uniqueSources = (() => {
    if (!message.sources?.length) return [];
    const seen = new Set<string>();
    return message.sources.filter((s) => {
      const d = getDomain(s.url);
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  })();

  // Stop playback whenever a new response starts loading
  useEffect(() => {
    if (isLoading) {
      speechSynthesis.cancel();
      setPlayState('idle');
    }
  }, [isLoading]);

  // Clean up on unmount
  useEffect(() => {
    return () => { speechSynthesis.cancel(); };
  }, []);

  const handleSpeak = () => {
    if (playState === 'playing') {
      speechSynthesis.pause();
      setPlayState('paused');
    } else if (playState === 'paused') {
      speechSynthesis.resume();
      setPlayState('playing');
    } else {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(stripMarkdown(message.content));
      utterance.onend = () => setPlayState('idle');
      utterance.onerror = () => setPlayState('idle');
      speechSynthesis.speak(utterance);
      setPlayState('playing');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-indigo-600 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white text-sm leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row md:gap-3 md:items-start">
      {/* Avatar + name: side-by-side on mobile, avatar-only column on desktop */}
      <div className="flex items-center gap-2 mb-2 md:mb-0 md:block">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center md:mt-0.5">
          <span className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">A</span>
        </div>
        <span className="text-indigo-500 dark:text-indigo-400 text-xs font-medium md:hidden">ArtSlaw</span>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        <span className="hidden md:block text-indigo-500 dark:text-indigo-400 text-xs font-medium mb-2">
          ArtSlaw
        </span>
        <div className="prose-art text-slate-700 dark:text-slate-300 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Sources — collapsible pill, Claude.ai style */}
        {uniqueSources.length > 0 && (
          <div className="mt-3 block max-w-full">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 overflow-hidden">
              {/* Header / collapsed pill */}
              <button
                onClick={() => setSourcesOpen((o) => !o)}
                className="flex items-center gap-3 px-3 py-2 w-full hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
              >
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex-shrink-0">Sources</span>
                {/* Overlapping favicons — up to 3 */}
                <div className="flex -space-x-2 flex-shrink-0">
                  {uniqueSources.slice(0, 3).map((s, i) => (
                    <img
                      key={i}
                      src={`https://www.google.com/s2/favicons?domain=${getDomain(s.url)}&sz=32`}
                      alt=""
                      className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-800 bg-white"
                    />
                  ))}
                </div>
                {/* Chevron */}
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ml-auto flex-shrink-0 ${sourcesOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded list */}
              {sourcesOpen && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  {uniqueSources.map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={s.title || s.url}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors group min-w-0"
                    >
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${getDomain(s.url)}&sz=32`}
                        alt=""
                        className="w-4 h-4 rounded flex-shrink-0 bg-white"
                      />
                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate min-w-0 flex-1">
                        {s.title || getDomain(s.url)}
                      </span>
                      <svg className="w-3 h-3 text-slate-400 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action bar — below message, mirroring Claude.ai style */}
        <div className="flex items-center gap-1 mt-2">
          {/* Copy */}
          <button
            onClick={handleCopy}
            aria-label="Copy message"
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors text-slate-400 hover:text-indigo-500"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          {/* Play / Pause / Resume */}
          <button
            onClick={handleSpeak}
            aria-label={playState === 'playing' ? 'Pause audio' : playState === 'paused' ? 'Resume audio' : 'Play audio'}
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              playState === 'playing' ? 'text-indigo-500' : 'text-slate-400 hover:text-indigo-500'
            }`}
          >
            {playState === 'playing' ? (
              /* Pause — two bars */
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : playState === 'paused' ? (
              /* Resume — play triangle */
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            ) : (
              /* Idle — speaker */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 0 1 0 7.072M12 6v12l-4-3H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3l4-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 0 1 0 12.728" />
              </svg>
            )}
          </button>

        </div>
      </div>
    </div>
  );
}
