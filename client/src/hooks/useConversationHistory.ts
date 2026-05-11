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

  // Fetch the latest published blog posts to suggest as starter tours.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/blog/published');
        if (!res.ok) return;
        const data = await res.json() as Array<{
          title: string;
          exhibitionUrl: string;
          tags: string[];
          coverImage?: { url: string; thumbnailUrl?: string } | null;
        }>;
        if (cancelled) return;
        const tours: SuggestedTour[] = data
          .filter((p) => p.exhibitionUrl)
          .slice(0, 3)
          .map((p) => ({
            exhibitionTitle: p.title,
            artistName: p.tags[0] ?? '',
            gallery: p.tags[1] ?? '',
            url: p.exhibitionUrl,
            imageUrl: p.coverImage?.thumbnailUrl ?? p.coverImage?.url ?? null,
          }));
        setSuggestedTours(tours);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return { conversations, setConversations, convLoading, suggestedTours };
}
