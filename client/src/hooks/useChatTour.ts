import { useState } from 'react';
import type { Message, Source, Conversation } from '../types';
import { titleFromUrl, authedFetch } from '../utils';

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
  const [mistralConversationId, setMistralConversationId] = useState<string | null>(null);

  const sendToApi = async (
    nextMessages: Message[],
    url?: string,
    lang: 'en' | 'de' = 'en',
    onChunk?: (accumulated: string) => void
  ): Promise<{ text: string; sources: Source[]; newMistralConvId: string | null }> => {
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
        ...(mistralConversationId ? { mistralConversationId } : {}),
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
    let newMistralConvId: string | null = null;
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
        let json: { t?: string; s?: Source[]; m?: string };
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
        } else if (json.m !== undefined) {
          newMistralConvId = json.m as string;
        }
      }
    }

    const text = fullText || "I wasn't able to complete the research. Please try again.";
    return { text, sources, newMistralConvId };
  };

  const startConversation = async (url: string): Promise<void> => {
    const id = crypto.randomUUID();
    const userMessage: Message = {
      role: 'user',
      content: 'Please guide me through this exhibition.',
    };

    setActiveConversationId(id);
    setExhibitionUrl(url);
    setHasStarted(true);
    setMessages([userMessage]);
    setIsLoading(true);
    setIsStreaming(false);
    setError(null);

    try {
      const { text: reply, sources, newMistralConvId } = await sendToApi([userMessage], url, language, (accumulated) => {
        setMessages([userMessage, { role: 'assistant', content: accumulated }]);
      });
      if (newMistralConvId) setMistralConversationId(newMistralConvId);
      const finalMessages: Message[] = [userMessage, { role: 'assistant', content: reply, sources }];
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
      const { text: reply, sources, newMistralConvId } = await sendToApi(nextMessages, undefined, language, (accumulated) => {
        setMessages([...nextMessages, { role: 'assistant', content: accumulated }]);
      });
      if (newMistralConvId) setMistralConversationId(newMistralConvId);
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
    setMistralConversationId(null);
    setHasStarted(false);
    setMessages([]);
    setExhibitionUrl('');
    setError(null);
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
    startConversation,
    sendMessage,
    resetChatState,
    loadConversationState,
  };
}
