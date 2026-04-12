import type { UsageData } from '../hooks/useUsage';

interface Props {
  usage: UsageData | null;
  className?: string;
}

function Bar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isWarn = pct >= 80;
  const isCrit = pct >= 95;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isCrit ? 'bg-red-500' : isWarn ? 'bg-amber-400' : 'bg-indigo-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function UsageIndicator({ usage, className = 'hidden sm:flex flex-col gap-1 w-24' }: Props) {
  if (!usage) return null;

  const title =
    `Daily: ${usage.daily.used.toLocaleString()} / ${usage.daily.limit.toLocaleString()} tokens\n` +
    `Monthly: ${usage.monthly.used.toLocaleString()} / ${usage.monthly.limit.toLocaleString()} tokens`;

  return (
    <div
      className={className}
      title={title}
      aria-label="Token usage"
    >
      <Bar used={usage.daily.used}   limit={usage.daily.limit}   label="Daily" />
      <Bar used={usage.monthly.used} limit={usage.monthly.limit} label="Monthly" />
    </div>
  );
}
