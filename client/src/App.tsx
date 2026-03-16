import { useState } from 'react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import ExhibitionLinkInput from './components/ExhibitionLinkInput';
import Sidebar from './components/Sidebar';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  exhibitionUrl: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'artguide_conversations';

function loadConversationsFromStorage(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function saveConversationsToStorage(convs: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch {
    // quota exceeded — silently fail
  }
}

function titleFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname.split('/').filter(Boolean).pop() ?? hostname;
    const readable = slug.replace(/[-_]/g, ' ');
    return readable.length > 40 ? readable.slice(0, 37) + '...' : readable;
  } catch {
    return url.slice(0, 40);
  }
}

function App() {
  const [exhibitionUrl, setExhibitionUrl] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(
    () => loadConversationsFromStorage()
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

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
    const id = crypto.randomUUID();
    const userMessage: Message = {
      role: 'user',
      content: 'Please guide me through this exhibition.',
    };

    setActiveConversationId(id);
    setExhibitionUrl(url);
    setHasStarted(true);
    setMessages([userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const reply = await sendToApi([userMessage], url);
      const finalMessages: Message[] = [userMessage, { role: 'assistant', content: reply }];
      setMessages(finalMessages);

      const newConv: Conversation = {
        id,
        title: titleFromUrl(url),
        exhibitionUrl: url,
        messages: finalMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updated = [newConv, ...conversations];
      setConversations(updated);
      saveConversationsToStorage(updated);
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
      const finalMessages: Message[] = [...nextMessages, { role: 'assistant', content: reply }];
      setMessages(finalMessages);

      if (activeConversationId) {
        const updated = conversations.map((c) =>
          c.id === activeConversationId
            ? { ...c, messages: finalMessages, updatedAt: Date.now() }
            : c
        );
        setConversations(updated);
        saveConversationsToStorage(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const startNewTour = () => {
    setActiveConversationId(null);
    setHasStarted(false);
    setMessages([]);
    setExhibitionUrl('');
    setError(null);
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setActiveConversationId(id);
    setExhibitionUrl(conv.exhibitionUrl);
    setMessages(conv.messages);
    setHasStarted(true);
    setError(null);
    setIsLoading(false);
  };

  const deleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    saveConversationsToStorage(updated);
    if (activeConversationId === id) {
      startNewTour();
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            ArtGuide
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Your personal gallery companion
          </p>
        </div>
      </header>

      {/* Body row: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={loadConversation}
          onNew={startNewTour}
          onDelete={deleteConversation}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full">
            {!hasStarted ? (
              <ExhibitionLinkInput onStart={startConversation} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden px-4 pb-2">
                {/* Exhibition URL badge */}
                {exhibitionUrl && (
                  <div className="flex-shrink-0 mt-4 mb-2">
                    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="truncate max-w-xs">{exhibitionUrl}</span>
                    </span>
                  </div>
                )}

                <ChatWindow messages={messages} isLoading={isLoading} />

                {error && (
                  <div className="flex-shrink-0 mt-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {error}
                  </div>
                )}

                <InputBar onSend={sendMessage} isLoading={isLoading} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
