import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import Anthropic from '@anthropic-ai/sdk';
import { recordUsage } from '../db/usage';
import { checkUsageLimits } from '../middleware/checkUsageLimits';
import { fetchPageContent } from '../services/pageContent';
import {
  runClaudeChat,
  runMistralChat,
  CHAT_MODEL,
  MISTRAL_CHAT_MODEL,
} from '../services/chatRunner';
import { CHAT_SYSTEM_PROMPTS, buildChatInitialUserMessage } from '../prompts';

const router = Router();

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
}

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
      // Target the LAST user message: with free-text discovery, earlier user
      // messages are search queries — the tour request is always the latest.
      let lastUserIdx = -1;
      for (let i = apiMessages.length - 1; i >= 0; i--) {
        if (apiMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx !== -1) {
        const original = apiMessages[lastUserIdx].content as string;
        // Fetch the exhibition page directly so the model has its actual content,
        // not just whatever a search engine happens to have indexed. Both providers
        // now share the same web_search tool for anything the page doesn't cover.
        const pageContent = await fetchPageContent(exhibitionUrl!);
        apiMessages[lastUserIdx] = {
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

    const maxTokens = isInitialRequest ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS;
    const system = CHAT_SYSTEM_PROMPTS[lang];
    const onText = (t: string) => res.write(`data: ${JSON.stringify({ t })}\n\n`);

    const result =
      provider === 'claude'
        ? await runClaudeChat({ messages: apiMessages, system, maxTokens }, { onText })
        : await runMistralChat(
            {
              // apiMessages was built from ChatMessage[] — roles are only user/assistant
              messages: apiMessages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content as string,
              })),
              system,
              maxTokens,
            },
            { onText },
          );

    if (result.sources.length > 0) {
      res.write(`data: ${JSON.stringify({ s: result.sources })}\n\n`);
    }

    res.end();
    // Fire-and-forget — response is already sent
    const model = provider === 'claude' ? CHAT_MODEL : MISTRAL_CHAT_MODEL;
    console.log(
      `[chat] provider=${provider} model=${model} input=${result.usage.inputTokens} output=${result.usage.outputTokens}`,
    );
    recordUsage(userId, result.usage.inputTokens, result.usage.outputTokens)
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
