import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import type { Conversation, SuggestedTour } from '../types';

interface Params {
  isSignedIn: boolean | undefined;
  getToken: () => Promise<string | null>;
}

interface Return {
  conversations: Conversation[];
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  convLoading: boolean;
  suggestedTours: SuggestedTour[];
}

export function useConversationHistory({ isSignedIn, getToken }: Params): Return {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [suggestedTours, setSuggestedTours] = useState<SuggestedTour[]>([]);

  // Load conversations from server whenever the user signs in.
  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    setConvLoading(true);

    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/conversations', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load conversations (${res.status})`);
        const data: Conversation[] = await res.json();
        if (!cancelled) setConversations(data);
      } catch (err) {
        console.error('[conversations]', err);
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isSignedIn]);

  // Fetch curated starter exhibitions for new users with no past tours.
  useEffect(() => {
    if (convLoading || !isSignedIn || conversations.length !== 0) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/discoveries', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSuggestedTours((data as SuggestedTour[]).slice(0, 3));
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [convLoading, isSignedIn, conversations.length]);

  return { conversations, setConversations, convLoading, suggestedTours };
}
