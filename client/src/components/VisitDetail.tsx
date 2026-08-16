import { useEffect } from 'react';
import { VISIT_POINTS } from '../lib/gamification';
import type { Visit } from '../lib/gamification';

export function visitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface Props {
  visit: Visit;
  hasConversation: boolean;
  onClose: () => void;
  onReopenTour: (conversationId: string) => void;
  onPickPhoto: (visitId: string) => void;
  onRemovePhoto: (visitId: string) => Promise<void>;
  onUncollect: (visitId: string) => Promise<void>;
}

export default function VisitDetail({
  visit,
  hasConversation,
  onClose,
  onReopenTour,
  onPickPhoto,
  onRemovePhoto,
  onUncollect,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={visit.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center text-lg leading-none"
        >
          ×
        </button>

        {visit.photoUrl ? (
          <img
            src={visit.photoUrl}
            alt={`Your photo of ${visit.title}`}
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-indigo-100 to-slate-200 dark:from-indigo-900/30 dark:to-slate-700">
            <img
              src={`/api/favicon?domain=${encodeURIComponent(hostnameOf(visit.exhibitionUrl))}`}
              alt=""
              className="w-10 h-10"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        <div className="p-4 flex flex-col gap-3">
          <div>
            <div className="font-serif text-base text-slate-900 dark:text-slate-100">
              {visit.title}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {hostnameOf(visit.exhibitionUrl)} · {visitDate(visit.visitedAt)}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-medium">
              +{VISIT_POINTS} pts
            </span>
            {hasConversation && (
              <button
                onClick={() => onReopenTour(visit.conversationId!)}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium"
              >
                Reopen tour →
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={() => onPickPhoto(visit.id)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
            >
              {visit.photoUrl ? 'Replace photo' : '📷 Add photo'}
            </button>
            {visit.photoUrl && (
              <button
                onClick={() => onRemovePhoto(visit.id)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-red-400 hover:text-red-500 transition-colors"
              >
                Remove photo
              </button>
            )}
            <button
              onClick={async () => {
                const id = visit.id;
                onClose();
                await onUncollect(id);
              }}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              Un-collect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
