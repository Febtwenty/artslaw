import { useState } from 'react';
import { Conversation } from '../App';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const convDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (convDay.getTime() === today.getTime()) return 'Today';
  if (convDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Sidebar({ isOpen, onClose, conversations, activeId, onSelect, onNew, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div className={[
        'fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col',
        'transform transition-transform duration-200 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'md:static md:inset-auto md:z-auto md:w-56 md:flex-shrink-0 md:translate-x-0',
      ].join(' ')}>
      {/* Mobile header row with close button */}
      <div className="flex-shrink-0 flex items-center justify-between p-3 md:block">
        <button
          onClick={onNew}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shadow-sm"
        >
          <span className="text-base leading-none">+</span>
          New Tour
        </button>
        <button
          onClick={onClose}
          className="md:hidden ml-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          aria-label="Close menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Search */}
      {conversations.length > 0 && (
        <div className="flex-shrink-0 px-3 pb-2">
          <input
            type="search"
            placeholder="Search tours..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 text-base md:text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      )}

      {/* Label */}
      {conversations.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-2">
          <span className="text-slate-400 text-xs font-medium tracking-wide uppercase">
            Past Tours
          </span>
          <div className="mt-1.5 h-px bg-slate-100 dark:bg-slate-700" />
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-4 py-3 text-slate-400 text-xs">
            No past tours yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-3 text-slate-400 text-xs">No results.</p>
        ) : (
          <ul>
            {filtered.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <li key={conv.id} className="group relative">
                  <button
                    onClick={() => onSelect(conv.id)}
                    className={[
                      'w-full text-left pl-4 pr-8 py-2.5 transition-colors border-l-2',
                      isActive
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 dark:bg-indigo-950 dark:border-indigo-400 dark:text-indigo-200'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100',
                    ].join(' ')}
                  >
                    <div className="truncate text-xs font-medium leading-snug capitalize">
                      {conv.title}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      {formatDate(conv.createdAt)}
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    title="Delete conversation"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
    </>
  );
}
