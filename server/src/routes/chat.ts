import { Router, Request, Response, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import Anthropic from '@anthropic-ai/sdk';
import { checkLimits, recordUsage } from '../db/usage';
import { getLimitsForUser } from '../config/limits';

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

const SYSTEM_PROMPTS = {
  en: `You are ArtSlaw, a friendly and knowledgeable art tour guide. When a user provides a link to an art exhibition, use the web search tool to research it thoroughly. Present your response in this structure, keeping each section brief:

1. A short, warm welcome paragraph that sets the scene.
2. **The Artist** — who they are, their background, style, and place in the art world.
3. **The Exhibition** — what the show is about, standout works, and one or two interesting facts.
4. **What to Look For** — concrete things to notice and why they matter, written for someone with no art background.

Always be curious, enthusiastic, and educational. Avoid jargon unless you explain it.`,
  de: `Du bist ArtSlaw, ein freundlicher und kenntnisreicher Kunstführer. Wenn ein Benutzer einen Link zu einer Kunstausstellung angibt, nutze das Web-Suchwerkzeug, um diese gründlich zu recherchieren. Präsentiere deine Antwort in dieser Struktur, wobei du jeden Abschnitt kurz hältst:

1. Ein kurzer, herzlicher Willkommensabsatz, der die Atmosphäre einfängt.
2. **Der Künstler** – wer er/sie ist, Hintergrund, Stil und Stellung in der Kunstwelt.
3. **Die Ausstellung** – worum es in der Schau geht, herausragende Werke und ein oder zwei interessante Fakten.
4. **Worauf man achten sollte** – konkrete Dinge, die man bemerken sollte und warum sie wichtig sind, erklärt für jemanden ohne Kunstkenntnisse.

Sei stets neugierig, enthusiastisch und lehrreich. Vermeide Fachbegriffe, wenn du sie nicht erklärst. Antworte immer auf Deutsch.`,
};

const MODEL = 'claude-haiku-4-5';
// Initial research (with web search) can be longer; follow-ups are short Q&A
const INITIAL_MAX_TOKENS = 2000;
const FOLLOWUP_MAX_TOKENS = 1200;
// How many messages to send on follow-ups (prevents history ballooning)
const MAX_HISTORY_MESSAGES = 6;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  exhibitionUrl?: string;
  language?: 'en' | 'de';
}

const checkUsageLimits: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) { next(); return; } // main handler re-checks auth
  try {
    const result = await checkLimits(userId, getLimitsForUser(userId));
    if (!result.allowed) {
      res.status(429).json({
        error: 'limit_exceeded',
        reason: result.reason,
        usage: { daily: result.daily, monthly: result.monthly },
        resetsAt: result.resetsAt?.toISOString(),
      });
      return;
    }
    next();
  } catch (err) {
    console.error('[usage] limit check failed:', err);
    next(); // fail-open: don't block chat if usage DB is temporarily down
  }
};

router.post('/', checkUsageLimits, async (req: Request, res: Response) => {
  let streamStarted = false;
  try {
    const { userId } = getAuth(req);
    if (!userId) {
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

    // Pass the search tool on all requests so Claude can look up artist
    // comparisons, market info, or related shows when follow-up questions need it.
    // Claude decides whether to actually invoke search — simple contextual
    // questions ("explain that more") are answered directly without a search call.
    const tools: Anthropic.Messages.WebSearchTool20250305[] = [
      { type: 'web_search_20250305', name: 'web_search' } as Anthropic.Messages.WebSearchTool20250305,
    ];

    const callParams = {
      model: MODEL,
      max_tokens: isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS,
      system: SYSTEM_PROMPTS[(req.body as ChatRequestBody).language === 'de' ? 'de' : 'en'],
      tools,
    };

    // Use SSE (text/event-stream) so Render's load balancer passes chunks
    // through immediately without buffering. Plain text/plain responses are
    // buffered by the proxy regardless of X-Accel-Buffering.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    streamStarted = true;

    const runStream = async (msgs: Anthropic.MessageParam[]) => {
      const stream = getClient().messages.stream({ ...callParams, messages: msgs });
      let prevBlockWasSearch = false;
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            // Only add a separator when resuming text after a search block
            if (prevBlockWasSearch) res.write(`data: ${JSON.stringify({ t: '\n\n' })}\n\n`);
            prevBlockWasSearch = false;
          } else {
            prevBlockWasSearch = true;
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ t: event.delta.text })}\n\n`);
        }
      }
      return stream.finalMessage();
    };

    // web_search_20250305 is server-side — Anthropic handles searches internally.
    // pause_turn means the internal search loop hit its iteration cap; resume once.
    const allFinalMessages: Anthropic.Message[] = [];
    const firstFinal = await runStream(apiMessages);
    allFinalMessages.push(firstFinal);
    if (firstFinal.stop_reason === 'pause_turn') {
      apiMessages.push({ role: 'assistant', content: firstFinal.content });
      allFinalMessages.push(await runStream(apiMessages));
    }

    // Extract source URLs from all web search result blocks across all final messages.
    const seen = new Set<string>();
    const allSources: { title: string; url: string }[] = [];
    for (const fm of allFinalMessages) {
      for (const block of fm.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const result of block.content) {
            if (result.type === 'web_search_result' && !seen.has(result.url)) {
              seen.add(result.url);
              allSources.push({ title: result.title, url: result.url });
            }
          }
        }
      }
    }
    if (allSources.length > 0) {
      res.write(`data: ${JSON.stringify({ s: allSources })}\n\n`);
    }

    res.end();
    // Fire-and-forget — response is already sent
    const totalInput  = allFinalMessages.reduce((s, m) => s + (m.usage?.input_tokens  ?? 0), 0);
    const totalOutput = allFinalMessages.reduce((s, m) => s + (m.usage?.output_tokens ?? 0), 0);
    recordUsage(userId, totalInput, totalOutput)
      .catch(err => console.error('[usage] record failed:', err));
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
