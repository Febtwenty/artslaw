import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import TourPage from './components/TourPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import './index.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set');
}

const tourMatch = window.location.pathname.match(/^\/tour\/([^/]+)$/);

if (tourMatch) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <TourPage id={tourMatch[1]} />
    </React.StrictMode>
  );
} else {
  function Root() {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
      const handler = () => setPath(window.location.pathname);
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    }, []);

    function navigate(to: string) {
      window.history.pushState({}, '', to);
      setPath(to);
    }

    function StandalonePage({ children }: { children: React.ReactNode }) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
          <div className="max-w-2xl mx-auto px-6 pt-6">
            <button
              onClick={() => navigate('/')}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              ← Back
            </button>
          </div>
          {children}
        </div>
      );
    }

    if (path === '/privacy') return <StandalonePage><PrivacyPage navigate={navigate} /></StandalonePage>;
    if (path === '/terms') return <StandalonePage><TermsPage navigate={navigate} /></StandalonePage>;

    return (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App navigate={navigate} />
      </ClerkProvider>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  );
}
