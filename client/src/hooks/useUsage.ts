import { useState, useEffect } from 'react';
import { authedFetch } from '../utils';

export interface UsageData {
  daily:   { used: number; limit: number };
  monthly: { used: number; limit: number };
}

interface Params {
  getToken: () => Promise<string | null>;
  isSignedIn: boolean;
  refreshKey: number;
}

export function useUsage({ getToken, isSignedIn, refreshKey }: Params): { usage: UsageData | null } {
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    authedFetch(getToken, '/api/usage')
      .then(r => r.ok ? r.json() : null)
      .then((data: UsageData | null) => { if (!cancelled && data) setUsage(data); })
      .catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
  }, [isSignedIn, refreshKey]);

  return { usage };
}
