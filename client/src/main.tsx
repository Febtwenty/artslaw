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

    if (path === '/privacy') return <PrivacyPage navigate={navigate} />;
    if (path === '/terms') return <TermsPage navigate={navigate} />;
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
