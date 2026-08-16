import type { Visit } from '../lib/gamification';

interface Props {
  visits: Visit[];
  onOpenVisit: (visitId: string) => void;
  onViewCollection: () => void;
}

export default function RecentVisitsGrid({ visits, onOpenVisit, onViewCollection }: Props) {
  // Only photographed visits make a legible mosaic — a visit carries no
  // exhibition image of its own, so anything else would be a wall of gradients.
  // `visits` already arrives newest-first from GET /api/visits.
  const tiles = visits.filter(v => v.photoUrl).slice(0, 6);
  if (tiles.length === 0) return null;

  return (
    <div className="mt-10 w-full max-w-xl">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Your recent visits
        </p>
        <button
          type="button"
          onClick={onViewCollection}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          View all →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map(visit => (
          <button
            key={visit.id}
            type="button"
            onClick={() => onOpenVisit(visit.id)}
            aria-label={visit.title}
            className="group relative rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <img
              src={visit.photoThumbnailUrl ?? visit.photoUrl!}
              alt=""
              loading="lazy"
              className="w-full aspect-square object-cover transition-transform group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5">
              <span className="block text-[10px] leading-tight text-white text-left line-clamp-2">
                {visit.title}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
