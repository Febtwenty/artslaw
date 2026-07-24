import { useRef, useState } from 'react';
import { BADGES, PHOTO_POINTS } from '../lib/gamification';
import type { Visit, EarnedBadge } from '../lib/gamification';
import type { CollectResult } from '../hooks/useGamification';

interface Props {
  exhibitionUrl: string;
  title: string;
  conversationId?: string;
  visit: Visit | undefined;
  onCollect: (args: { exhibitionUrl: string; title: string; conversationId?: string }) => Promise<CollectResult | null>;
  onUncollect: (visitId: string) => Promise<void>;
  onUploadPhoto: (visitId: string, file: File) => Promise<{ pointsDelta: number } | null>;
}

export default function CollectStampButton({
  exhibitionUrl,
  title,
  conversationId,
  visit,
  onCollect,
  onUncollect,
  onUploadPhoto,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [floatText, setFloatText] = useState<string | null>(null);
  const [badgePop, setBadgePop] = useState<string | null>(null);
  const [stamped, setStamped] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFloat = (text: string) => {
    setFloatText(text);
    setTimeout(() => setFloatText(null), 1000);
  };

  const showBadgePop = (newBadges: EarnedBadge[]) => {
    const labels = newBadges
      .map(nb => {
        const b = BADGES.find(bd => bd.id === nb.id);
        return b ? `${b.emoji} ${b.name} +${b.points}` : null;
      })
      .filter(Boolean)
      .join('  ·  ');
    if (!labels) return;
    setBadgePop(labels);
    setTimeout(() => setBadgePop(null), 2500);
  };

  const handleCollect = async () => {
    if (busy) return;
    setBusy(true);
    setStamped(true);
    setTimeout(() => setStamped(false), 400);
    const result = await onCollect({ exhibitionUrl, title, conversationId });
    if (result) {
      showFloat(`+${result.pointsDelta}`);
      if (result.newBadges.length) showBadgePop(result.newBadges);
    }
    setBusy(false);
  };

  const handleUncollect = async () => {
    if (busy || !visit) return;
    setBusy(true);
    await onUncollect(visit.id);
    setBusy(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !visit || busy) return;
    setBusy(true);
    const result = await onUploadPhoto(visit.id, file);
    if (result && result.pointsDelta > 0) showFloat(`+${PHOTO_POINTS} · photo`);
    setBusy(false);
  };

  return (
    <span className="relative inline-flex items-center gap-2 flex-shrink-0">
      {floatText && (
        <span className="float-up absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold text-indigo-500 dark:text-indigo-400 whitespace-nowrap pointer-events-none">
          {floatText}
        </span>
      )}
      {badgePop && (
        <span className="absolute top-full right-0 mt-2 z-20 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 shadow-lg text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap pointer-events-none">
          {badgePop}
        </span>
      )}

      {visit ? (
        <>
          {/* Photo affordance — only once collected */}
          {visit.photoUrl ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Replace your visit photo"
              className="flex-shrink-0"
            >
              <img
                src={visit.photoUrl}
                alt="Your visit"
                className="w-6 h-6 rounded object-cover border border-slate-200 dark:border-slate-600 hover:opacity-80 transition-opacity"
              />
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="hidden sm:inline text-xs text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors whitespace-nowrap"
            >
              📷 Add a photo of your visit
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFile}
          />
          <button
            onClick={handleUncollect}
            disabled={busy}
            title="Collected — click to un-collect"
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap ${stamped ? 'stamp-pop' : ''}`}
          >
            ✓ Collected · +10 pts
          </button>
        </>
      ) : (
        <button
          onClick={handleCollect}
          disabled={busy}
          title="Mark this exhibition as visited"
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors whitespace-nowrap ${stamped ? 'stamp-pop' : ''}`}
        >
          🎟 Collect this visit
        </button>
      )}
    </span>
  );
}
