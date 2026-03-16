import { useEffect, useRef } from 'react';
import type { Message } from '../App';
import MessageBubble from './MessageBubble';

interface Props {
  messages: Message[];
  isLoading: boolean;
}

export default function ChatWindow({ messages, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">
      {messages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full text-stone-600 text-sm font-light">
          Your tour will begin shortly...
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {isLoading && (
        <div className="flex gap-3 items-start">
          {/* ArtGuide avatar */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-900/50 border border-amber-800/50 flex items-center justify-center mt-0.5">
            <span className="text-amber-300 text-xs font-serif font-semibold">A</span>
          </div>
          <div className="flex flex-col gap-1.5 pt-1.5">
            <div className="flex gap-1.5 items-center">
              <span
                className="w-2 h-2 bg-amber-700 rounded-full animate-bounce"
                style={{ animationDelay: '0ms', animationDuration: '900ms' }}
              />
              <span
                className="w-2 h-2 bg-amber-700 rounded-full animate-bounce"
                style={{ animationDelay: '180ms', animationDuration: '900ms' }}
              />
              <span
                className="w-2 h-2 bg-amber-700 rounded-full animate-bounce"
                style={{ animationDelay: '360ms', animationDuration: '900ms' }}
              />
            </div>
            <span className="text-stone-500 text-xs font-light italic tracking-wide">
              Researching the exhibition…
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
