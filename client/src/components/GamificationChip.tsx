import { levelForPoints } from '../lib/gamification';

interface Props {
  points: number;
  loaded: boolean;
  onClick: () => void;
  className?: string;
}

export default function GamificationChip({ points, loaded, onClick, className = 'hidden sm:flex flex-col gap-0.5 w-28' }: Props) {
  if (!loaded) return null;

  const level = levelForPoints(points);
  const pct = level.next
    ? Math.min(100, Math.round(((points - level.min) / (level.next.min - level.min)) * 100))
    : 100;
  const title = level.next
    ? `${points} / ${level.next.min} pts · ${level.next.min - points} pts to ${level.next.title}`
    : `${points} pts · Top level reached`;

  return (
    <button
      onClick={onClick}
      className={`${className} text-left rounded-lg px-1.5 py-1 -mx-1.5 -my-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer`}
      title={title}
      aria-label="My Collection"
    >
      <div className="flex justify-between items-baseline gap-2 text-[10px]">
        <span className="font-serif text-slate-600 dark:text-slate-300 truncate">{level.title}</span>
        <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{points} pts</span>
      </div>
      <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}
