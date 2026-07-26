import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message, Rating } from '../types';

interface Props {
  message: Message;
  isLoading?: boolean;
  shareUrl?: string;
  // Present only while no tour is active — candidate cards render their
  // "Start Tour" button only when provided
  onStartTour?: (url: string) => void;
  // Records a thumbs rating for this message; null toggles it off
  onFeedback?: (messageId: string, rating: Rating | null, reason?: string, comment?: string) => void;
  // Collect-visit stamp — passed only for the last assistant message
  collectSlot?: React.ReactNode;
}

// Reason chips for a thumbs-down (single-select) + free-text comment.
const DOWN_REASONS = ['Inaccurate', 'Made things up', 'Too generic', 'Not helpful', 'Other'];

// Defensive repair of structural markdown glue before rendering. Weaker models
// (e.g. Mistral) sometimes emit block elements without the surrounding blank
// lines CommonMark needs. Scope is intentionally minimal — headings and stray
// horizontal rules only; unmatched "**" is a prompt-layer concern, not touched
// here. Well-formed output (Claude) passes through unchanged.
function normalizeMarkdown(text: string): string {
  return text
    // An ATX heading glued to preceding text on the same line -> own block. The
    // preceding char must not be "#" (so a valid "## H" is never split apart) nor
    // a newline (already separated); "#{1,6} \S" needs trailing non-space so a
    // partially-streamed bare "##" doesn't match early.
    .replace(/([^\n#])(#{1,6}[ \t]+\S)/g, '$1\n\n$2')
    // Drop horizontal-rule runs the model emits as separators. Glued to the end of
    // a line (e.g. "lens---") they render literally; on their own line under text
    // they'd form a setext heading. Strip both, then collapse the blank lines left.
    .replace(/([^\n-])-{3,}(?=\r?\n|$)/g, '$1')
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
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

export default function MessageBubble({ message, isLoading, shareUrl, onStartTour, onFeedback, collectSlot }: Props) {
  const isUser = message.role === 'user';
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const [downReason, setDownReason] = useState('');
  const [downComment, setDownComment] = useState('');

  // Thumbs render on real narrative responses only — never on discovery cards,
  // and only once the message has a stable id and a handler is wired.
  const canRate = !isUser && !!onFeedback && !!message.id && !message.candidates?.length;

  const handleThumbUp = () => {
    if (!message.id || !onFeedback) return;
    setDownOpen(false);
    onFeedback(message.id, message.feedback === 'up' ? null : 'up');
  };

  const handleThumbDown = () => {
    if (!message.id || !onFeedback) return;
    if (message.feedback === 'down') {
      // Toggle off
      onFeedback(message.id, null);
      setDownOpen(false);
      return;
    }
    // Record the bare down-vote immediately, then reveal the reason popover
    onFeedback(message.id, 'down');
    setDownReason('');
    setDownComment('');
    setDownOpen(true);
  };

  const submitDownDetail = () => {
    if (!message.id || !onFeedback) return;
    onFeedback(message.id, 'down', downReason || undefined, downComment.trim() || undefined);
    setDownOpen(false);
  };

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
      utterance.lang = 'en-US';
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

  const handleShare = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    });
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-indigo-600 rounded-2xl rounded-tr-sm px-4 py-3">
          <p className="text-white text-base leading-relaxed font-serif">{message.content}</p>
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
        <div className="prose-art text-slate-700 dark:text-slate-300 text-base font-serif">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {normalizeMarkdown(message.content)}
          </ReactMarkdown>
        </div>

        {/* Exhibition candidates from a discovery search */}
        {message.candidates && message.candidates.length > 0 && (
          <div className="mt-3 flex flex-col gap-2.5">
            {message.candidates.map((candidate) => (
              <div
                key={candidate.url}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  {candidate.artist && (
                    <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate text-left">
                      {candidate.artist}
                    </p>
                  )}
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 line-clamp-2 leading-snug text-left transition-colors"
                  >
                    {candidate.title}
                  </a>
                  {candidate.venue && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate text-left">{candidate.venue}</p>
                  )}
                  {candidate.snippet && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2 text-left">{candidate.snippet}</p>
                  )}
                </div>
                {onStartTour && (
                  <button
                    type="button"
                    onClick={() => onStartTour(candidate.url)}
                    className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
                  >
                    Start Tour
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

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
                      src={`/api/favicon?domain=${getDomain(s.url)}`}
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
                        src={`/api/favicon?domain=${getDomain(s.url)}`}
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

          {/* Feedback thumbs — narrative responses only */}
          {canRate && (
            <>
              <button
                onClick={handleThumbUp}
                aria-label="Good response"
                aria-pressed={message.feedback === 'up'}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  message.feedback === 'up' ? 'text-indigo-500' : 'text-slate-400 hover:text-indigo-500'
                }`}
              >
                <svg className="w-4 h-4" fill={message.feedback === 'up' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M6.633 10.5H5.25m1.383 0c.055.194.084.4.084.612v6.276c0 .212-.03.418-.084.612m0-7.5H2.25a2.25 2.25 0 0 0-2.25 2.25v3a2.25 2.25 0 0 0 2.25 2.25h4.383" />
                </svg>
              </button>
              <button
                onClick={handleThumbDown}
                aria-label="Bad response"
                aria-pressed={message.feedback === 'down'}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  message.feedback === 'down' ? 'text-indigo-500' : 'text-slate-400 hover:text-indigo-500'
                }`}
              >
                <svg className="w-4 h-4" fill={message.feedback === 'down' ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 0 1-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54m.023-8.25H16.48a4.5 4.5 0 0 1-1.423-.23l-3.114-1.04a4.5 4.5 0 0 0-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 0 0 2.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.5a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" />
                </svg>
              </button>
            </>
          )}

          {/* Share */}
          {shareUrl && (
            <button
              onClick={handleShare}
              aria-label="Copy share link"
              className="w-7 h-7 flex items-center justify-center rounded-md transition-colors text-slate-400 hover:text-indigo-500"
            >
              {shared ? (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              )}
            </button>
          )}

          {/* Collect-visit stamp — last assistant message only */}
          {collectSlot && <span className="ml-1.5">{collectSlot}</span>}

        </div>

        {/* Thumbs-down reason popover */}
        {canRate && downOpen && (
          <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 max-w-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">What went wrong?</span>
              <button
                onClick={() => setDownOpen(false)}
                aria-label="Dismiss feedback form"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {DOWN_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setDownReason((cur) => (cur === r ? '' : r))}
                  className={`text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
                    downReason === r
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={downComment}
              onChange={(e) => setDownComment(e.target.value)}
              placeholder="Add a comment (optional)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-base sm:text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={submitDownDetail}
                className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
