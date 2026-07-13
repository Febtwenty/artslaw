import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import MessageBubble from './MessageBubble';

interface Props {
  messages: Message[];
  isLoading: boolean;
  shareUrl?: string;
  loadingLabel?: string;
  onStartTour?: (url: string) => void;
}

export default function ChatWindow({ messages, isLoading, shareUrl, loadingLabel, onStartTour }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = () => {
    const distanceFromBottom = document.body.scrollHeight - window.scrollY - window.innerHeight;
    userScrolledUp.current = distanceFromBottom > 100;
  };

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // When a new request starts, reset the flag so we scroll to the bottom initially.
  useEffect(() => {
    if (isLoading) userScrolledUp.current = false;
  }, [isLoading]);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  return (
    <div className="flex-1 py-4 space-y-6 scrollbar-thin">
      {messages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
          Your tour will begin shortly...
        </div>
      )}

      {(() => {
        const lastAssistantIdx = messages.reduce((last, m, i) => m.role === 'assistant' ? i : last, -1);
        return messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            isLoading={isLoading}
            shareUrl={!isLoading && i === lastAssistantIdx ? shareUrl : undefined}
            onStartTour={onStartTour}
          />
        ));
      })()}

      {isLoading && (
        <div className="flex gap-3 items-start">
          {/* ArtSlaw avatar */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mt-0.5">
            <span className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">A</span>
          </div>
          <div className="flex flex-col gap-1.5 pt-1.5">
            <div className="flex gap-1.5 items-center">
              <span
                className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: '0ms', animationDuration: '900ms' }}
              />
              <span
                className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: '180ms', animationDuration: '900ms' }}
              />
              <span
                className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: '360ms', animationDuration: '900ms' }}
              />
            </div>
            <span className="text-slate-400 text-xs italic">
              {loadingLabel ?? 'Researching the exhibition…'}
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
