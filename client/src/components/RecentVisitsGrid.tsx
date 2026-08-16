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

      {/* Same bare image wall as /collection's grid on mobile: 2px gutters,
          square photos, no chrome and no captions. */}
      <div className="grid grid-cols-3 gap-0.5">
        {tiles.map(visit => (
          <button
            key={visit.id}
            type="button"
            onClick={() => onOpenVisit(visit.id)}
            aria-label={visit.title}
            title={visit.title}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
          >
            <img
              src={visit.photoThumbnailUrl ?? visit.photoUrl!}
              alt=""
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
