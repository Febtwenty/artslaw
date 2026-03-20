import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArtSlaw/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, ' ')
      .trim();

    return text.length > 3000 ? text.slice(0, 3000) + '…' : text;
  } catch {
    return null;
  }
}

// Instantiated lazily so dotenv in index.ts has time to populate process.env
// before the Anthropic client reads ANTHROPIC_API_KEY.
let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are ArtSlaw, a friendly and knowledgeable art tour guide. When a user provides a link to an art exhibition, use the web search tool to research it thoroughly. Then explain the artist, the exhibition, the genre, and related artists in a warm, accessible, and engaging way — as if giving a personal gallery tour to someone with no art background. Always be curious, enthusiastic, and educational. Avoid jargon unless you explain it. Suggest what to look for and why it matters.`;

const MODEL = 'claude-haiku-4-5';
// Initial research (with web search) can be longer; follow-ups are short Q&A
const INITIAL_MAX_TOKENS = 1500;
const FOLLOWUP_MAX_TOKENS = 800;
// How many messages to send on follow-ups (prevents history ballooning)
const MAX_HISTORY_MESSAGES = 6;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  exhibitionUrl?: string;
}

router.post('/', async (req: Request, res: Response) => {
  let streamStarted = false;
  try {
    const authObject = (req as any).auth?.();
    if (!authObject?.userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { messages, exhibitionUrl } = req.body as ChatRequestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required and must not be empty' });
      return;
    }

    const isInitialRequest = Boolean(exhibitionUrl);

    // Build message list for the API call
    let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (isInitialRequest) {
      // Fetch the exhibition page directly so Claude has its actual content,
      // not just whatever a search engine happens to have indexed.
      const pageContent = await fetchPageContent(exhibitionUrl!);

      const firstUserIdx = apiMessages.findIndex((m) => m.role === 'user');
      if (firstUserIdx !== -1) {
        const original = apiMessages[firstUserIdx].content as string;
        const pageSection = pageContent
          ? `\n\nHere is the text content of the exhibition page:\n"""\n${pageContent}\n"""`
          : '';
        apiMessages[firstUserIdx] = {
          role: 'user',
          content: `I'm looking at this exhibition: ${exhibitionUrl}${pageSection}\n\n${original}`,
        };
      }
    } else {
      // Follow-up: trim history to the last MAX_HISTORY_MESSAGES to keep
      // input tokens low. Always keep at least the most recent user message.
      if (apiMessages.length > MAX_HISTORY_MESSAGES) {
        apiMessages = apiMessages.slice(-MAX_HISTORY_MESSAGES);
      }
    }

    // Only use web search on the initial request — it adds significant token
    // overhead that follow-up Q&A doesn't need.
    const tools: Anthropic.Messages.WebSearchTool20250305[] = isInitialRequest
      ? [{ type: 'web_search_20250305', name: 'web_search' } as Anthropic.Messages.WebSearchTool20250305]
      : [];

    const callParams = {
      model: MODEL,
      max_tokens: isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      ...(tools.length > 0 ? { tools } : {}),
    };

    // Switch to streaming mode
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    streamStarted = true;

    const runStream = async (msgs: Anthropic.MessageParam[]) => {
      const stream = getClient().messages.stream({ ...callParams, messages: msgs });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(event.delta.text);
        }
      }
      return stream.finalMessage();
    };

    // web_search_20250305 is server-side — Anthropic handles searches internally.
    // pause_turn means the internal search loop hit its iteration cap; resume once.
    const finalMessage = await runStream(apiMessages);
    if (finalMessage.stop_reason === 'pause_turn') {
      apiMessages.push({ role: 'assistant', content: finalMessage.content });
      await runStream(apiMessages);
    }

    res.end();
  } catch (error) {
    console.error('Chat error:', error);

    if (!streamStarted) {
      if (error instanceof Anthropic.AuthenticationError) {
        res.status(401).json({ error: 'Invalid API key. Check your ANTHROPIC_API_KEY.' });
      } else if (error instanceof Anthropic.RateLimitError) {
        res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
      } else if (error instanceof Anthropic.APIError) {
        res.status(500).json({ error: `API error: ${error.message}` });
      } else {
        res.status(500).json({ error: 'An unexpected error occurred.' });
      }
    } else {
      res.end();
    }
  }
});

export default router;
