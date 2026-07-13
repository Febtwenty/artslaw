import { useState } from 'react';
import type { Message, Source, Conversation } from '../types';
import { titleFromUrl, authedFetch } from '../utils';

const DISCOVERY_STRINGS = {
  en: {
    intro: "Here are current exhibitions matching your search — pick one and I'll guide you through it:",
    empty: 'No current exhibitions found. Try a different search or paste an exhibition URL.',
    limit: 'You have reached your usage limit. Please try again later.',
    error: 'Something went wrong searching for exhibitions. Please try again.',
  },
  de: {
    intro: 'Hier sind aktuelle Ausstellungen zu deiner Suche — wähle eine aus und ich führe dich hindurch:',
    empty: 'Keine aktuellen Ausstellungen gefunden. Versuche eine andere Suche oder füge einen Ausstellungslink ein.',
    limit: 'Du hast dein Nutzungslimit erreicht. Bitte versuche es später erneut.',
    error: 'Bei der Ausstellungssuche ist etwas schiefgelaufen. Bitte versuche es erneut.',
  },
};

const MAX_DISCOVERY_QUERY_LENGTH = 200;

interface Params {
  language: 'en' | 'de';
  provider: 'claude' | 'mistral';
  getToken: () => Promise<string | null>;
  onConversationCreated: (conv: Conversation) => void;
  onConversationCreationFailed: (id: string) => void;
  onConversationUpdated: (id: string, messages: Message[], updatedAt: number) => void;
}

interface Return {
  exhibitionUrl: string;
  messages: Message[];
  activeConversationId: string | null;
  hasStarted: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  setError: (err: string | null) => void;
  isDiscovering: boolean;
  startDiscovery: (query: string) => Promise<void>;
  startConversation: (url: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  resetChatState: () => void;
  loadConversationState: (conv: Conversation) => void;
}

export function useChatTour({
  language,
  provider,
  getToken,
  onConversationCreated,
  onConversationCreationFailed,
  onConversationUpdated,
}: Params): Return {
  const [exhibitionUrl, setExhibitionUrl] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const sendToApi = async (
    nextMessages: Message[],
    url?: string,
    lang: 'en' | 'de' = 'en',
    onChunk?: (accumulated: string) => void
  ): Promise<{ text: string; sources: Source[] }> => {
    const token = await getToken();
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: nextMessages,
        ...(url ? { exhibitionUrl: url } : {}),
        language: lang,
        provider,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Server error (${response.status}). Please try again.`;
      try {
        const data = await response.json();
        if (response.status === 429 && data.error === 'limit_exceeded') {
          const resetsAt: string | undefined = data.resetsAt;
          let resetStr = '';
          if (resetsAt) {
            const d = new Date(resetsAt);
            resetStr = ` Resets ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`;
          }
          errorMessage = data.reason === 'daily_limit'
            ? `You've reached your daily usage limit.${resetStr}`
            : `You've reached your monthly usage limit.${resetStr}`;
        } else if (data.error) {
          errorMessage = data.error;
        }
      } catch {}
      if (response.status === 401) {
        throw new Error('Authentication failed. Please sign out and sign in again.');
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('No response body received.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let sources: Source[] = [];
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE events are delimited by double newlines
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const event of events) {
        const dataLine = event.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        let json: { t?: string; s?: Source[] };
        try {
          json = JSON.parse(dataLine.slice(6));
        } catch {
          continue;
        }
        if (json.t !== undefined) {
          fullText += json.t as string;
          // Switch from loading dots to streaming text on first chunk
          if (fullText.length > 0) { setIsLoading(false); setIsStreaming(true); }
          onChunk?.(fullText);
        } else if (json.s !== undefined) {
          sources = json.s as Source[];
        }
      }
    }

    const text = fullText || "I wasn't able to complete the research. Please try again.";
    return { text, sources };
  };

  // Free-text search for current exhibitions, shown as cards in the chat.
  // No conversation is persisted until the user picks one and a tour starts.
  const startDiscovery = async (query: string): Promise<void> => {
    const trimmedQuery = query.trim().slice(0, MAX_DISCOVERY_QUERY_LENGTH);
    if (!trimmedQuery) return;
    const strings = DISCOVERY_STRINGS[language];
    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmedQuery }];

    setHasStarted(true);
    setMessages(nextMessages);
    setIsDiscovering(true);
    setIsLoading(true);
    setError(null);

    try {
      const res = await authedFetch(getToken, '/api/exhibition-search', {
        method: 'POST',
        body: JSON.stringify({ query: trimmedQuery, language, provider }),
      });
      if (res.ok) {
        const data = await res.json();
        const candidates = Array.isArray(data.candidates) ? data.candidates : [];
        setMessages([
          ...nextMessages,
          candidates.length > 0
            ? { role: 'assistant', content: strings.intro, candidates }
            : { role: 'assistant', content: strings.empty },
        ]);
      } else {
        setError(res.status === 429 ? strings.limit : strings.error);
      }
    } catch {
      setError(strings.error);
    } finally {
      setIsDiscovering(false);
      setIsLoading(false);
    }
  };

  const startConversation = async (url: string): Promise<void> => {
    const id = crypto.randomUUID();
    const userMessage: Message = {
      role: 'user',
      content: 'Please guide me through this exhibition.',
    };
    // Keep any discovery history (search query + candidate cards) in the tour
    const baseMessages = messages;
    const nextMessages: Message[] = [...baseMessages, userMessage];

    setActiveConversationId(id);
    setExhibitionUrl(url);
    setHasStarted(true);
    setMessages(nextMessages);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      const { text: reply, sources } = await sendToApi(nextMessages, url, language, (accumulated) => {
        setMessages([...nextMessages, { role: 'assistant', content: accumulated }]);
      });
      const finalMessages: Message[] = [...nextMessages, { role: 'assistant', content: reply, sources }];
      setMessages(finalMessages);

      let title = titleFromUrl(url);
      try {
        const titleRes = await authedFetch(getToken, '/api/generate-title', {
          method: 'POST',
          body: JSON.stringify({ text: reply.slice(0, 2000) }),
        });
        if (titleRes.ok) title = (await titleRes.json()).title;
      } catch { /* keep fallback title */ }

      const now = Date.now();
      const newConv: Conversation = {
        id,
        title,
        exhibitionUrl: url,
        provider,
        messages: finalMessages,
        createdAt: now,
        updatedAt: now,
      };
      onConversationCreated(newConv);

      authedFetch(getToken, '/api/conversations', {
        method: 'POST',
        body: JSON.stringify(newConv),
      }).catch((err) => {
        console.error('[conversations] create failed:', err);
        onConversationCreationFailed(id);
        setError('Could not save conversation. Please try again.');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const sendMessage = async (content: string): Promise<void> => {
    const userMessage: Message = { role: 'user', content };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      const { text: reply, sources } = await sendToApi(nextMessages, undefined, language, (accumulated) => {
        setMessages([...nextMessages, { role: 'assistant', content: accumulated }]);
      });
      const finalMessages: Message[] = [...nextMessages, { role: 'assistant', content: reply, sources }];
      setMessages(finalMessages);

      if (activeConversationId) {
        const now = Date.now();
        onConversationUpdated(activeConversationId, finalMessages, now);
        authedFetch(getToken, `/api/conversations/${activeConversationId}`, {
          method: 'PUT',
          body: JSON.stringify({ messages: finalMessages, updatedAt: now }),
        }).catch((err) => console.error('[conversations] update failed:', err));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const resetChatState = (): void => {
    setActiveConversationId(null);
    setHasStarted(false);
    setMessages([]);
    setExhibitionUrl('');
    setError(null);
    setIsDiscovering(false);
  };

  const loadConversationState = (conv: Conversation): void => {
    setActiveConversationId(conv.id);
    setExhibitionUrl(conv.exhibitionUrl);
    setMessages(conv.messages);
    setHasStarted(true);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  };

  return {
    exhibitionUrl,
    messages,
    activeConversationId,
    hasStarted,
    isLoading,
    isStreaming,
    error,
    setError,
    isDiscovering,
    startDiscovery,
    startConversation,
    sendMessage,
    resetChatState,
    loadConversationState,
  };
}
