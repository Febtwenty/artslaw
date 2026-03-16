import { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import ExhibitionLinkInput from './components/ExhibitionLinkInput';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function App() {
  const [exhibitionUrl, setExhibitionUrl] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const sendToApi = async (
    nextMessages: Message[],
    url?: string
  ): Promise<string> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: nextMessages,
        ...(url ? { exhibitionUrl: url } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? 'Something went wrong. Please try again.');
    }

    return data.content as string;
  };

  const startConversation = async (url: string) => {
    const userMessage: Message = {
      role: 'user',
      content: 'Please guide me through this exhibition.',
    };

    setExhibitionUrl(url);
    setHasStarted(true);
    setMessages([userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const reply = await sendToApi([userMessage], url);
      setMessages([userMessage, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);

    try {
      const reply = await sendToApi(nextMessages);
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setHasStarted(false);
    setMessages([]);
    setExhibitionUrl('');
    setError(null);
  };

  return (
    <div className="h-full flex flex-col bg-stone-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-stone-800/60 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold tracking-wide text-amber-100">
            ArtGuide
          </h1>
          <p className="text-stone-500 text-xs font-light mt-0.5 tracking-wide uppercase">
            Your personal gallery companion
          </p>
        </div>
        {hasStarted && (
          <button
            onClick={reset}
            className="text-stone-500 hover:text-stone-300 text-xs font-light tracking-widest uppercase transition-colors"
          >
            New Tour
          </button>
        )}
      </header>

      {/* Decorative rule */}
      <div className="flex-shrink-0 h-px bg-gradient-to-r from-transparent via-amber-800/40 to-transparent" />

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full">
        {!hasStarted ? (
          <ExhibitionLinkInput onStart={startConversation} />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden px-4 pb-2">
            {/* Exhibition URL badge */}
            {exhibitionUrl && (
              <div className="flex-shrink-0 mt-4 mb-2">
                <span className="inline-flex items-center gap-2 text-xs text-stone-500 font-light">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-700 flex-shrink-0" />
                  <span className="truncate max-w-xs">{exhibitionUrl}</span>
                </span>
              </div>
            )}

            <ChatWindow messages={messages} isLoading={isLoading} />

            {error && (
              <div className="flex-shrink-0 mt-2 px-4 py-3 bg-red-950/40 border border-red-900/50 rounded-lg text-red-400 text-sm font-light">
                {error}
              </div>
            )}

            <InputBar onSend={sendMessage} isLoading={isLoading} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
