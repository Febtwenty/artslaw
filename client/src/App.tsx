import { useState } from 'react';
import { useAuth, SignIn, UserButton } from '@clerk/react';
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
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [exhibitionUrl, setExhibitionUrl] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(
    () => loadConversationsFromStorage()
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <SignIn />
      </div>
    );
  }

  const sendToApi = async (
    nextMessages: Message[],
    url?: string,
    onChunk?: (accumulated: string) => void
  ): Promise<string> => {
    const token = await getToken();
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: nextMessages,
        ...(url ? { exhibitionUrl: url } : {}),
      }),
    });

    if (!response.ok) {
      let errorMessage = `Server error (${response.status}). Please try again.`;
      try {
        const data = await response.json();
        if (data.error) errorMessage = data.error;
      } catch {}
      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign out and sign in again.');
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('No response body received.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      // Switch from loading dots to streaming text on first chunk
      if (fullText.length > 0) {
        setIsLoading(false);
        setIsStreaming(true);
      }
      onChunk?.(fullText);
    }

    return fullText || "I wasn't able to complete the research. Please try again.";
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
    setIsStreaming(false);
    setError(null);

    try {
      const reply = await sendToApi([userMessage], url, (accumulated) => {
        setMessages([userMessage, { role: 'assistant', content: accumulated }]);
      });
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
      setIsStreaming(false);
    }
  };

  const sendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      const reply = await sendToApi(nextMessages, undefined, (accumulated) => {
        setMessages([...nextMessages, { role: 'assistant', content: accumulated }]);
      });
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
      setIsStreaming(false);
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
    setIsStreaming(false);
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
      <header className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">ArtSlaw</h1>
            <p className="text-slate-400 text-xs mt-0.5">Your personal gallery companion</p>
          </div>
        </div>
        <UserButton />
      </header>

      {/* Body row: sidebar + content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={(id) => { loadConversation(id); setSidebarOpen(false); }}
          onNew={() => { startNewTour(); setSidebarOpen(false); }}
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

                <InputBar onSend={sendMessage} isLoading={isLoading || isStreaming} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
