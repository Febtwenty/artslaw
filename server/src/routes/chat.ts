import { Router, Request, Response, RequestHandler } from 'express';
import { getAuth } from '@clerk/express';
import Anthropic from '@anthropic-ai/sdk';
import { checkLimits, recordUsage } from '../db/usage';
import { getLimitsForUser } from '../config/limits';
import {
  anthropicWebSearchTool,
  mistralWebSearchTool,
  handleAnthropicToolUse,
  runWebSearchTool,
  dedupeSources,
  Source,
} from '../services/webSearchTool';
import { CHAT_SYSTEM_PROMPTS, buildChatInitialUserMessage } from '../prompts';

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

// @mistralai/mistralai v2 is ESM-only; use dynamic import to avoid
// top-level import errors in a CommonJS-compiled TypeScript module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mistral: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMistralClient(): Promise<any> {
  if (!_mistral) {
    const { Mistral } = await import('@mistralai/mistralai');
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}

const MODEL = 'claude-haiku-4-5';
const MISTRAL_MODEL = 'mistral-small-latest';
// Initial research (with web search) can be longer; follow-ups are short Q&A
const INITIAL_MAX_TOKENS = 2000;
const FOLLOWUP_MAX_TOKENS = 1200;
// How many messages to send on follow-ups (prevents history ballooning)
const MAX_HISTORY_MESSAGES = 10;
// Bounds how many search round-trips a single turn can make (cost/latency cap)
const MAX_TOOL_ITERATIONS = 4;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  exhibitionUrl?: string;
  language?: 'en' | 'de';
  provider?: 'claude' | 'mistral';
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
    const provider = (req.body as ChatRequestBody).provider === 'mistral' ? 'mistral' : 'claude';
    const lang = (req.body as ChatRequestBody).language === 'de' ? 'de' : 'en';

    // Build message list for the API call
    let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (isInitialRequest) {
      const firstUserIdx = apiMessages.findIndex((m) => m.role === 'user');
      if (firstUserIdx !== -1) {
        const original = apiMessages[firstUserIdx].content as string;
        // Fetch the exhibition page directly so the model has its actual content,
        // not just whatever a search engine happens to have indexed. Both providers
        // now share the same web_search tool for anything the page doesn't cover.
        const pageContent = await fetchPageContent(exhibitionUrl!);
        apiMessages[firstUserIdx] = {
          role: 'user',
          content: buildChatInitialUserMessage({ exhibitionUrl: exhibitionUrl!, pageContent, original }),
        };
      }
    } else {
      // Follow-up: trim history to the last MAX_HISTORY_MESSAGES to keep
      // input tokens low. Always keep at least the most recent user message.
      if (apiMessages.length > MAX_HISTORY_MESSAGES) {
        apiMessages = apiMessages.slice(-MAX_HISTORY_MESSAGES);
      }
    }

    // Use SSE (text/event-stream) so Render's load balancer passes chunks
    // through immediately without buffering. Plain text/plain responses are
    // buffered by the proxy regardless of X-Accel-Buffering.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    streamStarted = true;

    if (provider === 'claude') {
      // Custom, model-driven web_search tool — the server executes searches
      // against Tavily and feeds results back. Claude decides whether to
      // actually invoke search — simple contextual questions ("explain that
      // more") are answered directly without a search call.
      const tools: Anthropic.Tool[] = [anthropicWebSearchTool()];

      const callParams = {
        model: MODEL,
        max_tokens: isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS,
        system: CHAT_SYSTEM_PROMPTS[lang],
        tools,
      };

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

      // Loop: run a turn, and if Claude asked to search, execute it against
      // Tavily and feed the result back, until it answers or we hit the bound.
      let current = apiMessages;
      const allFinalMessages: Anthropic.Message[] = [];
      const seen = new Set<string>();
      const allSources: Source[] = [];
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const finalMsg = await runStream(current);
        allFinalMessages.push(finalMsg);
        if (finalMsg.stop_reason !== 'tool_use') break;
        const handled = await handleAnthropicToolUse(finalMsg);
        if (!handled) break;
        current = [...current, ...handled.toAppend];
        dedupeSources(seen, handled.sources, allSources);
      }

      if (allSources.length > 0) {
        res.write(`data: ${JSON.stringify({ s: allSources })}\n\n`);
      }

      res.end();
      // Fire-and-forget — response is already sent
      const totalInput  = allFinalMessages.reduce((s, m) => s + (m.usage?.input_tokens  ?? 0), 0);
      const totalOutput = allFinalMessages.reduce((s, m) => s + (m.usage?.output_tokens ?? 0), 0);
      console.log(`[chat] provider=claude model=${MODEL} input=${totalInput} output=${totalOutput}`);
      recordUsage(userId, totalInput, totalOutput)
        .catch(err => console.error('[usage] record failed:', err));

    } else {
      // Mistral Chat Completions API — stateless, symmetric with Claude. Full
      // message history is resent every turn; web_search is our own custom
      // tool executed against Tavily rather than Mistral's native web_search.
      const client = await getMistralClient();
      const tools = [mistralWebSearchTool()];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let msgs: any[] = [
        { role: 'system', content: CHAT_SYSTEM_PROMPTS[lang] },
        ...apiMessages.map((m) => ({ role: m.role, content: m.content as string })),
      ];

      const maxTokens = isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const seen = new Set<string>();
      const allSources: Source[] = [];

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const stream = await client.chat.stream({ model: MISTRAL_MODEL, messages: msgs, tools, maxTokens });

        let textThisTurn = '';
        // The SDK's own streaming example overwrites (not appends/concatenates)
        // this on each chunk that carries tool call deltas — Mistral streams
        // each tool call already-complete rather than fragmenting arguments.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let latestToolCalls: any[] | null = null;
        let finishReason: string | null | undefined = null;

        for await (const event of stream) {
          const choice = event.data?.choices?.[0];
          if (!choice) continue;
          const content = choice.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            textThisTurn += content;
            res.write(`data: ${JSON.stringify({ t: content })}\n\n`);
          }
          if (choice.delta?.toolCalls) latestToolCalls = choice.delta.toolCalls;
          if (choice.finishReason) finishReason = choice.finishReason;
          if (event.data?.usage) {
            totalInputTokens  += event.data.usage.promptTokens ?? 0;
            totalOutputTokens += event.data.usage.completionTokens ?? 0;
          }
        }

        if (finishReason !== 'tool_calls' || !latestToolCalls || latestToolCalls.length === 0) break;

        msgs.push({ role: 'assistant', content: textThisTurn || null, toolCalls: latestToolCalls });
        for (const call of latestToolCalls) {
          let query = '';
          try {
            query = JSON.parse(call.function.arguments || '{}').query ?? '';
          } catch { /* malformed args — search with empty query, tool result explains failure */ }
          const { resultText, sources } = await runWebSearchTool(query);
          dedupeSources(seen, sources, allSources);
          msgs.push({ role: 'tool', name: call.function.name, content: resultText, toolCallId: call.id });
        }
      }

      if (allSources.length > 0) {
        res.write(`data: ${JSON.stringify({ s: allSources })}\n\n`);
      }

      res.end();
      console.log(`[chat] provider=mistral model=${MISTRAL_MODEL} input=${totalInputTokens} output=${totalOutputTokens}`);
      recordUsage(userId, totalInputTokens, totalOutputTokens)
        .catch(err => console.error('[usage] record failed:', err));
    }
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
