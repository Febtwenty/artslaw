import { useState, useEffect, useCallback } from 'react';
import { authedFetch, authedUpload } from '../utils';
import type { Visit, EarnedBadge, LevelUpInfo } from '../lib/gamification';

interface Params {
  getToken: () => Promise<string | null>;
  isSignedIn: boolean;
}

export interface CollectResult {
  pointsDelta: number;
  newBadges: EarnedBadge[];
  levelUp: LevelUpInfo | null;
}

export interface GamificationState {
  visits: Visit[];
  points: number;
  badges: EarnedBadge[];
  loaded: boolean;
  levelUp: LevelUpInfo | null;
  visitForUrl: (url: string) => Visit | undefined;
  collect: (args: { exhibitionUrl: string; title: string; conversationId?: string }) => Promise<CollectResult | null>;
  uncollect: (visitId: string) => Promise<void>;
  uploadPhoto: (visitId: string, file: File) => Promise<{ pointsDelta: number } | null>;
  removePhoto: (visitId: string) => Promise<void>;
  clearLevelUp: () => void;
}

export function useGamification({ getToken, isSignedIn }: Params): GamificationState {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [points, setPoints] = useState(0);
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [levelUp, setLevelUp] = useState<LevelUpInfo | null>(null);

  const refetch = useCallback(async () => {
    const res = await authedFetch(getToken, '/api/visits');
    if (!res.ok) return;
    const data = await res.json();
    setVisits(data.visits);
    setPoints(data.points);
    setBadges(data.badges);
    setLoaded(true);
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    authedFetch(getToken, '/api/visits')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data) return;
        setVisits(data.visits);
        setPoints(data.points);
        setBadges(data.badges);
        setLoaded(true);
      })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  const visitForUrl = useCallback(
    (url: string) => visits.find(v => v.exhibitionUrl === url),
    [visits]
  );

  const collect = useCallback(
    async (args: { exhibitionUrl: string; title: string; conversationId?: string }): Promise<CollectResult | null> => {
      try {
        const res = await authedFetch(getToken, '/api/visits', {
          method: 'POST',
          body: JSON.stringify(args),
        });
        if (res.status === 409) {
          // Already collected (double-click or stale state) — reconcile silently
          await refetch();
          return null;
        }
        if (!res.ok) return null;
        const data = await res.json();
        setVisits(prev => [data.visit, ...prev.filter(v => v.id !== data.visit.id)]);
        setPoints(data.totalPoints);
        if (data.newBadges.length) {
          setBadges(prev => [...prev, ...data.newBadges.filter(
            (nb: EarnedBadge) => !prev.some(b => b.id === nb.id)
          )]);
        }
        if (data.levelUp) setLevelUp(data.levelUp);
        return { pointsDelta: data.pointsDelta, newBadges: data.newBadges, levelUp: data.levelUp };
      } catch {
        return null;
      }
    },
    [getToken, refetch]
  );

  const uncollect = useCallback(
    async (visitId: string) => {
      try {
        const res = await authedFetch(getToken, `/api/visits/${visitId}`, { method: 'DELETE' });
        if (res.status === 404) {
          await refetch();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        setVisits(prev => prev.filter(v => v.id !== visitId));
        setPoints(data.totalPoints);
      } catch { /* non-critical */ }
    },
    [getToken, refetch]
  );

  const uploadPhoto = useCallback(
    async (visitId: string, file: File): Promise<{ pointsDelta: number } | null> => {
      try {
        const fd = new FormData();
        fd.append('photo', file);
        const res = await authedUpload(getToken, `/api/visits/${visitId}/photo`, fd);
        if (!res.ok) return null;
        const data = await res.json();
        setVisits(prev => prev.map(v => (v.id === visitId ? data.visit : v)));
        setPoints(data.totalPoints);
        if (data.levelUp) setLevelUp(data.levelUp);
        return { pointsDelta: data.pointsDelta };
      } catch {
        return null;
      }
    },
    [getToken]
  );

  const removePhoto = useCallback(
    async (visitId: string) => {
      try {
        const res = await authedFetch(getToken, `/api/visits/${visitId}/photo`, { method: 'DELETE' });
        if (!res.ok) return;
        const data = await res.json();
        setVisits(prev => prev.map(v => (v.id === visitId ? data.visit : v)));
      } catch { /* non-critical */ }
    },
    [getToken]
  );

  const clearLevelUp = useCallback(() => setLevelUp(null), []);

  return { visits, points, badges, loaded, levelUp, visitForUrl, collect, uncollect, uploadPhoto, removePhoto, clearLevelUp };
}
