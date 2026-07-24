import { useEffect, useMemo } from 'react';
import type { LevelUpInfo } from '../lib/gamification';

interface Props {
  levelUp: LevelUpInfo | null;
  onDismiss: () => void;
}

const CONFETTI_COLORS = ['bg-indigo-500', 'bg-amber-400', 'bg-rose-400', 'bg-emerald-400', 'bg-sky-400'];

export default function LevelUpOverlay({ levelUp, onDismiss }: Props) {
  useEffect(() => {
    if (!levelUp) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [levelUp, onDismiss]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 0.8}s`,
        duration: `${2 + Math.random() * 2}s`,
      })),
    // regenerate per level-up
    [levelUp]
  );

  if (!levelUp) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center overflow-hidden"
      onClick={onDismiss}
      role="dialog"
      aria-label="Level up"
    >
      {confetti.map((c, i) => (
        <span
          key={i}
          className={`confetti-piece w-2 h-2 rounded-sm ${c.color}`}
          style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration }}
        />
      ))}
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl px-8 py-6 text-center max-w-xs mx-4">
        <div className="text-4xl mb-2">🎨</div>
        <h2 className="font-serif text-2xl text-slate-900 dark:text-slate-100 mb-1">Level up!</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          You&rsquo;re now a <span className="font-medium text-indigo-600 dark:text-indigo-400">{levelUp.to}</span>
        </p>
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-indigo-500 bar-grow" />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          <span>{levelUp.from}</span>
          <span>{levelUp.to}</span>
        </div>
      </div>
    </div>
  );
}
