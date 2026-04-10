import { useState, useEffect } from 'react';
import type { Conversation } from '../types';
import LogoWordmark from './LogoWordmark';
import ChatWindow from './ChatWindow';

interface Props {
  id: string;
}

function Header() {
  return (
    <header className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 flex items-center justify-between">
      <a href="/" className="text-left">
        <LogoWordmark className="h-6 w-auto" />
        <p className="text-slate-400 text-xs mt-0.5">Your personal gallery companion</p>
      </a>
      <a
        href="/"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors"
      >
        Try ArtSlaw
      </a>
    </header>
  );
}

export default function TourPage({ id }: Props) {
  const [tour, setTour] = useState<Conversation | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tour/${id}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) { setNotFound(true); return; }
        const data: Conversation = await res.json();
        setTour(data);
      } catch {
        setNotFound(true);
      }
    })();
  }, [id]);

  if (notFound) {
    return (
      <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400 text-sm">Tour not found.</p>
        </div>
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      <Header />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden max-w-3xl mx-auto w-full px-4 pb-4">
          {tour.exhibitionUrl && (
            <div className="flex-shrink-0 mt-4 mb-2">
              <a href={tour.exhibitionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-indigo-500 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="truncate max-w-xs">{tour.exhibitionUrl}</span>
              </a>
            </div>
          )}
          <ChatWindow messages={tour.messages} isLoading={false} />
        </div>
      </main>
    </div>
  );
}
