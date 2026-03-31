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
        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
          Your tour will begin shortly...
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} isLoading={isLoading} />
      ))}

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
              Researching the exhibition…
            </span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
