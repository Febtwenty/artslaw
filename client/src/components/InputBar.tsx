import { useState, useRef, KeyboardEvent } from 'react';

interface Props {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export default function InputBar({ onSend, isLoading }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="flex-shrink-0 border-t border-stone-800/60 pt-4 mt-2">
      {/* Suggestion chips (shown when input is empty) */}
      {input === '' && !isLoading && (
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            'Who is the artist?',
            'What movement does this belong to?',
            'Tell me more about the works on display',
            'Suggest similar artists',
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setInput(suggestion);
                textareaRef.current?.focus();
              }}
              className="text-xs text-stone-500 border border-stone-800 rounded-full px-3 py-1 hover:border-amber-800/50 hover:text-stone-400 transition-colors font-light"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask about the artist, the works, or anything you're curious about…"
          rows={1}
          disabled={isLoading}
          className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-800 focus:ring-1 focus:ring-amber-800/40 transition-all font-light text-sm resize-none disabled:opacity-40 min-h-[46px]"
          style={{ lineHeight: '1.5' }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-amber-800 hover:bg-amber-700 disabled:bg-stone-800 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <svg className="w-4 h-4 text-stone-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className={`w-4 h-4 transition-colors ${canSend ? 'text-amber-100' : 'text-stone-600'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>

      <p className="text-stone-700 text-xs mt-2 font-light text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
