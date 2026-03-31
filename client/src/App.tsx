import { useState, useEffect } from 'react';
import { useAuth, UserButton } from '@clerk/react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import ExhibitionLinkInput from './components/ExhibitionLinkInput';
import Sidebar from './components/Sidebar';
import SignInPage from './components/SignInPage';

export interface Source {
  title: string;
  url: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

export interface Conversation {
  id: string;
  title: string;
  exhibitionUrl: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Load conversations from server whenever the user signs in.
  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    setConvLoading(true);

    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/conversations', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);
        const data: Conversation[] = await res.json();
        if (!cancelled) setConversations(data);
      } catch (err) {
        console.error('[conversations]', err);
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInPage isDark={isDark} onToggleDark={() => setIsDark(!isDark)} />;
  }

  if (convLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Authenticated fetch helper that injects the Bearer token.
  const conversationsFetch = async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    return fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  };

  const sendToApi = async (
    nextMessages: Message[],
    url?: string,
    onChunk?: (accumulated: string) => void
  ): Promise<{ text: string; sources: Source[] }> => {
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
      // Strip sources footer before passing to live display
      onChunk?.(fullText.split('\n<!--SOURCES:')[0]);
    }

    const srcMatch = fullText.match(/\n<!--SOURCES:(.*?)-->$/s);
    const sources: Source[] = srcMatch ? (JSON.parse(srcMatch[1]) as Source[]) : [];
    const text = fullText.split('\n<!--SOURCES:')[0] || "I wasn't able to complete the research. Please try again.";
    return { text, sources };
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
      const { text: reply, sources } = await sendToApi([userMessage], url, (accumulated) => {
        setMessages([userMessage, { role: 'assistant', content: accumulated }]);
      });
      const finalMessages: Message[] = [userMessage, { role: 'assistant', content: reply, sources }];
      setMessages(finalMessages);

      const now = Date.now();
      const newConv: Conversation = {
        id,
        title: titleFromUrl(url),
        exhibitionUrl: url,
        messages: finalMessages,
        createdAt: now,
        updatedAt: now,
      };
      setConversations((prev) => [newConv, ...prev]);

      conversationsFetch('/api/conversations', {
        method: 'POST',
        body: JSON.stringify(newConv),
      }).catch((err) => console.error('[conversations] create failed:', err));
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
      const { text: reply, sources } = await sendToApi(nextMessages, undefined, (accumulated) => {
        setMessages([...nextMessages, { role: 'assistant', content: accumulated }]);
      });
      const finalMessages: Message[] = [...nextMessages, { role: 'assistant', content: reply, sources }];
      setMessages(finalMessages);

      if (activeConversationId) {
        const now = Date.now();
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId ? { ...c, messages: finalMessages, updatedAt: now } : c
          )
        );
        conversationsFetch(`/api/conversations/${activeConversationId}`, {
          method: 'PUT',
          body: JSON.stringify({ messages: finalMessages, updatedAt: now }),
        }).catch((err) => console.error('[conversations] update failed:', err));
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
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      startNewTour();
    }
    conversationsFetch(`/api/conversations/${id}`, { method: 'DELETE' })
      .catch((err) => console.error('[conversations] delete failed:', err));
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">ArtSlaw</h1>
            <p className="text-slate-400 text-xs mt-0.5">Your personal gallery companion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Dark mode toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700 transition-colors"
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
          <UserButton />
        </div>
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
                  <div className="flex-shrink-0 mt-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-400">
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
