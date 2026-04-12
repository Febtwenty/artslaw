import { useState, useEffect } from 'react';
import { useAuth, UserButton } from '@clerk/react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import ExhibitionLinkInput from './components/ExhibitionLinkInput';
import Sidebar from './components/Sidebar';
import SignInPage from './components/SignInPage';
import DiscoverPage from './components/DiscoverPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import LogoWordmark from './components/LogoWordmark';
import { useDarkMode } from './hooks/useDarkMode';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useChatTour } from './hooks/useChatTour';
import { useUsage } from './hooks/useUsage';
import { authedFetch } from './utils';
import UsageIndicator from './components/UsageIndicator';

export type { Source, Message, SuggestedTour, Conversation } from './types';

function App({ navigate }: { navigate: (path: string) => void }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [view, setView] = useState<'home' | 'discover' | 'privacy' | 'terms'>(() =>
    window.location.pathname === '/discover' ? 'discover' : 'home'
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'de'>('en');
  const { isDark, setIsDark } = useDarkMode();
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);
  const { conversations, setConversations, convLoading, suggestedTours } =
    useConversationHistory({ isSignedIn, getToken });
  const { usage } = useUsage({ getToken, isSignedIn: isSignedIn ?? false, refreshKey: usageRefreshKey });
  const {
    exhibitionUrl,
    messages,
    activeConversationId,
    hasStarted,
    isLoading,
    isStreaming,
    error,
    startConversation,
    sendMessage,
    resetChatState,
    loadConversationState,
  } = useChatTour({
    language,
    getToken,
    onConversationCreated: (conv) => {
      setConversations((prev) => [conv, ...prev]);
      setUsageRefreshKey(k => k + 1);
    },
    onConversationCreationFailed: (id) => setConversations((prev) => prev.filter((c) => c.id !== id)),
    onConversationUpdated: (id, msgs, updatedAt) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, messages: msgs, updatedAt } : c))
      );
      setUsageRefreshKey(k => k + 1);
    },
  });

  // Keep URL in sync with view state and handle browser back/forward
  useEffect(() => {
    const target = view === 'discover' ? '/discover' : '/';
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }
  }, [view]);

  useEffect(() => {
    const onPop = () => {
      setView(window.location.pathname === '/discover' ? 'discover' : 'home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (view === 'privacy' || view === 'terms') {
      window.scrollTo(0, 0);
    }
  }, [view]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <SignInPage isDark={isDark} onToggleDark={() => setIsDark(!isDark)} navigate={navigate} />;
  }

  if (convLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const startNewTour = () => {
    resetChatState();
    setView('home');
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    loadConversationState(conv);
    setView('home');
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      startNewTour();
    }
    authedFetch(getToken, `/api/conversations/${id}`, { method: 'DELETE' })
      .catch((err) => console.error('[conversations] delete failed:', err));
  };

  const handleStartTour = (url: string) => {
    setView('home');
    startConversation(url);
  };

  const isDiscover = view === 'discover';

  return (
    <div className="flex flex-col flex-1 bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 flex items-center justify-between">
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
          <button onClick={startNewTour} className="text-left">
            <LogoWordmark className="h-6 w-auto" />
            <p className="text-slate-400 text-xs mt-0.5">{isDiscover ? 'Discover exhibitions' : 'Your personal gallery companion'}</p>
          </button>
        </div>
        <div className="flex items-center gap-3">
          {/* Discover / Back-to-chats toggle */}
          <button
            onClick={() => setView(isDiscover ? 'home' : 'discover')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isDiscover
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700'
            }`}
            aria-label={isDiscover ? 'Back to chats' : 'Discover exhibitions'}
            title={isDiscover ? 'Chats' : 'Discover'}
          >
            {isDiscover ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M7.28 7.72a.75.75 0 0 1 0 1.06l-2.47 2.47H21a.75.75 0 0 1 0 1.5H4.81l2.47 2.47a.75.75 0 1 1-1.06 1.06l-3.75-3.75a.75.75 0 0 1 0-1.06l3.75-3.75a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">Chats</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">Discover</span>
              </>
            )}
          </button>
          <div className="hidden sm:block w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <UsageIndicator usage={usage} />
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
          <div className="flex items-center">
            <UserButton />
          </div>
        </div>
      </header>

      {/* Body row: sidebar + content */}
      <div className="flex-1 flex">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          conversations={conversations}
          activeId={isDiscover ? null : activeConversationId}
          onSelect={(id) => { loadConversation(id); setSidebarOpen(false); }}
          onNew={() => { startNewTour(); setSidebarOpen(false); }}
          onDelete={deleteConversation}
          usage={usage}
          navigate={(path) => {
            if (path === '/privacy') setView('privacy');
            else if (path === '/terms') setView('terms');
            else navigate(path);
          }}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {view === 'privacy' ? (
            <PrivacyPage navigate={(path) => { if (path === '/privacy') setView('privacy'); else if (path === '/terms') setView('terms'); else { setView('home'); navigate('/'); } }} />
          ) : view === 'terms' ? (
            <TermsPage navigate={(path) => { if (path === '/privacy') setView('privacy'); else if (path === '/terms') setView('terms'); else { setView('home'); navigate('/'); } }} />
          ) : isDiscover ? (
            <DiscoverPage onStartTour={handleStartTour} />
          ) : (
            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
              {!hasStarted ? (
                <ExhibitionLinkInput onStart={startConversation} language={language} onLanguageChange={setLanguage} suggestedTours={suggestedTours} />
              ) : (
                <div className="flex-1 flex flex-col px-4 pb-2">
                  {/* Exhibition URL badge */}
                  {exhibitionUrl && (
                    <div className="flex-shrink-0 mt-4 mb-2">
                      <a href={exhibitionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        <span className="truncate max-w-xs">{exhibitionUrl}</span>
                      </a>
                    </div>
                  )}

                  <ChatWindow
                    messages={messages}
                    isLoading={isLoading}
                    shareUrl={activeConversationId ? `${window.location.origin}/tour/${activeConversationId}` : undefined}
                  />

                  {error && (
                    <div className="flex-shrink-0 mt-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <InputBar onSend={sendMessage} isLoading={isLoading || isStreaming} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
