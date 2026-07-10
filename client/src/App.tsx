import { useState, useEffect } from 'react';
import { useAuth, useClerk, UserButton } from '@clerk/react';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import ExhibitionLinkInput from './components/ExhibitionLinkInput';
import Sidebar from './components/Sidebar';
import SignInPage from './components/SignInPage';
import DiscoverPage from './components/DiscoverPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import LogoWordmark from './components/LogoWordmark';
import BlogPage from './components/BlogPage';
import BlogAdmin from './components/BlogAdmin';
import { useDarkMode } from './hooks/useDarkMode';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useChatTour } from './hooks/useChatTour';
import { useUsage } from './hooks/useUsage';
import { authedFetch } from './utils';
import UsageIndicator from './components/UsageIndicator';

export type { Source, Message, SuggestedTour, Conversation } from './types';

type View = 'home' | 'discover' | 'privacy' | 'terms' | 'blog' | 'admin';

function parsePath(): { view: View; blogSlug: string | null } {
  const p = window.location.pathname;
  if (p === '/discover') return { view: 'discover', blogSlug: null };
  if (p === '/admin/blog') return { view: 'admin', blogSlug: null };
  if (p === '/blog') return { view: 'blog', blogSlug: null };
  if (p.startsWith('/blog/')) return { view: 'blog', blogSlug: decodeURIComponent(p.slice(6)) };
  return { view: 'home', blogSlug: null };
}

function App({ navigate }: { navigate: (path: string) => void }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const initial = parsePath();
  const [view, setView] = useState<View>(initial.view);
  const [blogSlug, setBlogSlug] = useState<string | null>(initial.blogSlug);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'de'>('en');
  const [provider, setProvider] = useState<'claude' | 'mistral'>('mistral');
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
    provider,
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

  // Fetch admin status once signed in
  useEffect(() => {
    if (!isSignedIn) return;
    authedFetch(getToken, '/api/blog/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsAdmin(d.isAdmin); })
      .catch(() => {});
  }, [isSignedIn, getToken]);

  // Keep URL in sync with view/blogSlug state
  useEffect(() => {
    let target = '/';
    if (view === 'discover') target = '/discover';
    else if (view === 'admin') target = '/admin/blog';
    else if (view === 'blog') target = blogSlug ? `/blog/${encodeURIComponent(blogSlug)}` : '/blog';
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }
  }, [view, blogSlug]);

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const { view: v, blogSlug: s } = parsePath();
      setView(v);
      setBlogSlug(s);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (view === 'privacy' || view === 'terms') {
      window.scrollTo(0, 0);
    }
  }, [view]);

  const navigateToBlog = (slug: string | null) => {
    setBlogSlug(slug);
    setView('blog');
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn) {
    if (view === 'blog') {
      return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
          <header className="sticky top-0 z-10 flex-shrink-0 px-6 py-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <button onClick={() => setView('home')} className="text-left">
              <LogoWordmark className="h-6 w-auto" />
            </button>
            <div className="flex items-center gap-2">
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
              <button
                onClick={() => setView('home')}
                className="flex items-center justify-center gap-1.5 w-20 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" /><path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a1.016 1.016 0 0 0 .091-.086L12 5.432Z" />
                </svg>
                Home
              </button>
              <button
                onClick={() => openSignIn()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Sign in
              </button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto">
            <BlogPage initialSlug={blogSlug} onNavigatePost={navigateToBlog} />
          </main>
        </div>
      );
    }
    return <SignInPage isDark={isDark} onToggleDark={() => setIsDark(!isDark)} navigate={(path) => {
      if (path === '/blog') { navigateToBlog(null); }
      else navigate(path);
    }} />;
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
    setProvider('mistral');
    setView('home');
  };

  const loadConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setProvider(conv.provider ?? 'claude');
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
  const isBlog = view === 'blog';

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
            <p className="text-slate-400 text-xs mt-0.5">
              {isDiscover ? 'Discover exhibitions' : isBlog ? 'Exhibition reviews' : 'Your personal gallery companion'}
            </p>
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Discover toggle */}
          <button
            onClick={() => setView(isDiscover ? 'home' : 'discover')}
            className={`flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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

          {/* Blog button — all users */}
          <button
            onClick={() => navigateToBlog(null)}
            className={`flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isBlog
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700'
            }`}
            title="Blog"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
            </svg>
            <span className="hidden sm:inline">Blog</span>
          </button>

          {/* Blog admin button — admins only */}
          {isAdmin && (
            <button
              onClick={() => setView(view === 'admin' ? 'home' : 'admin')}
              className={`flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === 'admin'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Blog admin"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M21.731 2.269a2.625 2.625 0 0 0-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 0 0 0-3.712ZM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 0 0-1.32 2.214l-.8 2.685a.75.75 0 0 0 .933.933l2.685-.8a5.25 5.25 0 0 0 2.214-1.32l8.4-8.4Z" />
                <path d="M5.25 5.25a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3V13.5a.75.75 0 0 0-1.5 0v5.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V8.25a1.5 1.5 0 0 1 1.5-1.5h5.25a.75.75 0 0 0 0-1.5H5.25Z" />
              </svg>
              <span className="hidden sm:inline">Edit</span>
            </button>
          )}

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
          activeId={isDiscover || isBlog ? null : activeConversationId}
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
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden min-w-0">
          {view === 'blog' ? (
            <BlogPage initialSlug={blogSlug} onNavigatePost={navigateToBlog} onStartTour={handleStartTour} />
          ) : view === 'admin' ? (
            <BlogAdmin getToken={getToken} />
          ) : view === 'privacy' ? (
            <PrivacyPage navigate={(path) => { if (path === '/privacy') setView('privacy'); else if (path === '/terms') setView('terms'); else { setView('home'); navigate('/'); } }} />
          ) : view === 'terms' ? (
            <TermsPage navigate={(path) => { if (path === '/privacy') setView('privacy'); else if (path === '/terms') setView('terms'); else { setView('home'); navigate('/'); } }} />
          ) : isDiscover ? (
            <DiscoverPage onStartTour={handleStartTour} />
          ) : (
            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
              {!hasStarted ? (
                <ExhibitionLinkInput onStart={startConversation} language={language} onLanguageChange={setLanguage} provider={provider} onProviderChange={setProvider} suggestedTours={suggestedTours} onNavigateBlog={navigateToBlog} />
              ) : (
                <div className="flex-1 flex flex-col px-4 pb-2">
                  {exhibitionUrl && (
                    <div className="flex-shrink-0 mt-4 mb-2 flex items-center justify-between gap-2">
                      <a href={exhibitionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-indigo-500 transition-colors min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        <span className="truncate max-w-xs">{exhibitionUrl}</span>
                      </a>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {provider === 'mistral' ? '🇪🇺 Mistral' : '🇺🇸 Claude'}
                      </span>
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
