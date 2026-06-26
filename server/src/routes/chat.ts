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

const SYSTEM_PROMPTS = {
  en: `You are ArtSlaw, a knowledgeable and honest art guide. When a user provides a link to an art exhibition, use the web search tool to research it thoroughly. Present your response in this structure, keeping each section brief:

1. A short, grounded opening that sets the scene.
2. **The Artist** — who they are, their background, style, and where they stand in the art world.
3. **The Exhibition** — what the show is about, notable works, and one or two interesting facts.
4. **What to Look For** — concrete things to notice and why they matter, written for someone with no art background.

Be curious, honest, and educational. Not every exhibition is exceptional — if the work is derivative, the show is modest in scope, or the concept feels thin, say so plainly. Engagement comes from specificity and honesty, not from enthusiasm. Avoid jargon unless you explain it.

For follow-up questions, only invoke web search if the question genuinely requires new information not available from your initial research — for example, an entirely different artist or venue the user now asks about. For questions that ask you to elaborate, summarize, reformat, or build on information already in the conversation, answer directly from that context without searching.`,
  de: `Du bist ArtSlaw, ein kenntnisreicher und ehrlicher Kunstführer. Wenn ein Benutzer einen Link zu einer Kunstausstellung angibt, nutze das Web-Suchwerkzeug, um diese gründlich zu recherchieren. Präsentiere deine Antwort in dieser Struktur, wobei du jeden Abschnitt kurz hältst:

1. Ein kurzer, sachlicher Eröffnungsparagraph, der die Situation beschreibt.
2. **Der Künstler** – wer er/sie ist, Hintergrund, Stil und Stellung in der Kunstwelt.
3. **Die Ausstellung** – worum es in der Schau geht, nennenswerte Werke und ein oder zwei interessante Fakten.
4. **Worauf man achten sollte** – konkrete Dinge, die man bemerken sollte und warum sie interessant sind, erklärt für jemanden ohne Kunstkenntnisse.

Sei neugierig, ehrlich und lehrreich. Nicht jede Ausstellung ist außergewöhnlich – wenn die Werke konventionell sind, die Schau einen bescheidenen Rahmen hat oder das Konzept dünn wirkt, sage das offen. Engagement entsteht durch Genauigkeit und Ehrlichkeit, nicht durch Begeisterung. Vermeide Fachbegriffe, wenn du sie nicht erklärst. Antworte immer auf Deutsch.

Für Folgefragen nutze die Websuche nur, wenn die Frage wirklich neue Informationen erfordert, die in deiner ursprünglichen Recherche nicht abgedeckt wurden — zum Beispiel einen völlig anderen Künstler oder Veranstaltungsort, nach dem der Nutzer jetzt fragt. Für Fragen, die darum bitten, bereits Besprochenes auszuarbeiten, zusammenzufassen, umzuformatieren oder darauf aufzubauen, antworte direkt aus diesem Kontext heraus, ohne zu suchen.`,
};

const MODEL = 'claude-haiku-4-5';
// Initial research (with web search) can be longer; follow-ups are short Q&A
const INITIAL_MAX_TOKENS = 2000;
const FOLLOWUP_MAX_TOKENS = 1200;
// How many messages to send on follow-ups (prevents history ballooning)
const MAX_HISTORY_MESSAGES = 10;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  exhibitionUrl?: string;
  language?: 'en' | 'de';
  provider?: 'claude' | 'mistral';
  mistralConversationId?: string;
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
        if (provider === 'claude') {
          // Fetch the exhibition page directly so Claude has its actual content,
          // not just whatever a search engine happens to have indexed.
          const pageContent = await fetchPageContent(exhibitionUrl!);
          const pageSection = pageContent
            ? `\n\nHere is the text content of the exhibition page:\n"""\n${pageContent}\n"""`
            : '';
          apiMessages[firstUserIdx] = {
            role: 'user',
            content: `I'm looking at this exhibition: ${exhibitionUrl}${pageSection}\n\n${original}`,
          };
        } else {
          // Mistral: send only the URL but explicitly instruct it to perform
          // multiple searches. Pre-fetching the page suppresses web_search
          // because Mistral sees it already has the content; without the page
          // content it will search — but by default it only searches for the
          // URL itself. The numbered steps below push it to do the same breadth
          // of research that Claude does via web_search_20250305.
          apiMessages[firstUserIdx] = {
            role: 'user',
            content:
              `I'm looking at this art exhibition: ${exhibitionUrl}\n\n` +
              `Please use web search to research this comprehensively — perform multiple searches:\n` +
              `1. Look up the exhibition page to find what is shown and who the featured artist(s) are.\n` +
              `2. Search for the artist's background, career, style, and position in the art world.\n` +
              `3. Search for critical reception, reviews, or notable context about this exhibition or the artist's work.\n` +
              `4. Search for any relevant facts about the gallery, venue, or art movement.\n\n` +
              original,
          };
        }
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
        system: SYSTEM_PROMPTS[lang],
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

    } else {
      // Mistral Conversations API — supports web_search tool with source citations
      const body = req.body as ChatRequestBody;
      const existingMistralConvId = body.mistralConversationId;
      const client = await getMistralClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let streamResult: any;

      if (existingMistralConvId && !isInitialRequest) {
        // In-session follow-up: Mistral holds conversation history server-side,
        // so we only send the latest user message.
        const lastUserMsg = apiMessages[apiMessages.length - 1].content as string;
        streamResult = await client.beta.conversations.appendStream({
          conversationId: existingMistralConvId,
          conversationAppendStreamRequest: {
            inputs: lastUserMsg,
            completionArgs: { maxTokens: FOLLOWUP_MAX_TOKENS },
          },
        });
      } else {
        // Initial request or session reload (no Mistral conv ID stored):
        // build inputs from the full apiMessages so context is preserved.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inputs: any = apiMessages.length === 1
          ? (apiMessages[0].content as string)
          : apiMessages.map(m => ({
              type: 'message.input' as const,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
            }));
        streamResult = await client.beta.conversations.startStream({
          inputs,
          instructions: SYSTEM_PROMPTS[lang],
          model: 'mistral-medium-latest',
          tools: [{ type: 'web_search' }],
          completionArgs: { maxTokens: isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS },
        });
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let newMistralConvId: string | null = null;

      for await (const event of streamResult) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = event as any;
        // Use the SSE 'event:' field as discriminator — the SDK's discriminatedUnion
        // falls back to { type:"UNKNOWN" } when JSON data lacks a matching 'type'
        // field, making d.type unreliable for some events (e.g. response.started).
        const evType: string = e.event ?? '';
        const d = e.data;

        if (evType === 'conversation.response.started') {
          // conversationId may be in parsed d or in the raw fallback object
          newMistralConvId = d?.conversationId ?? d?.raw?.conversation_id ?? null;
        } else if (evType === 'message.output.delta') {
          const content = d?.content;
          if (typeof content === 'string' && content.length > 0) {
            res.write(`data: ${JSON.stringify({ t: content })}\n\n`);
          } else if (content?.type === 'text' && typeof content.text === 'string' && content.text.length > 0) {
            res.write(`data: ${JSON.stringify({ t: content.text })}\n\n`);
          }
        } else if (evType === 'conversation.response.done') {
          inputTokens  = d?.usage?.promptTokens    ?? 0;
          outputTokens = d?.usage?.completionTokens ?? 0;
        }
      }

      // tool_reference chunks (source citations) are NOT emitted as streaming
      // delta events — they only appear in the full stored message. Fetch it now.
      const convId = newMistralConvId ?? (req.body as ChatRequestBody).mistralConversationId ?? null;
      if (convId) {
        try {
          const msgs = await client.beta.conversations.getMessages({ conversationId: convId });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lastAssistant = [...(msgs as any).messages].reverse().find((m: any) => m.role === 'assistant');
          if (lastAssistant && Array.isArray(lastAssistant.content)) {
            const seen = new Set<string>();
            const sources: { title: string; url: string }[] = [];
            for (const chunk of lastAssistant.content) {
              const isToolRef = chunk.type === 'tool_reference' || (chunk.type == null && chunk.url != null);
              if (isToolRef && chunk.url && !seen.has(chunk.url)) {
                seen.add(chunk.url);
                sources.push({ title: chunk.title ?? chunk.url, url: chunk.url });
              }
            }
            if (sources.length > 0) res.write(`data: ${JSON.stringify({ s: sources })}\n\n`);
            console.log(`[mistral] ${sources.length} source(s), ${inputTokens}in/${outputTokens}out`);
          }
        } catch (err) {
          console.error('[mistral] getMessages failed:', err);
        }
        res.write(`data: ${JSON.stringify({ m: convId })}\n\n`);
      }

      res.end();
      recordUsage(userId, inputTokens, outputTokens)
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
