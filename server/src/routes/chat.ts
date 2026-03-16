import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

// Instantiated lazily so dotenv in index.ts has time to populate process.env
// before the Anthropic client reads ANTHROPIC_API_KEY.
let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are ArtGuide, a friendly and knowledgeable art tour guide. When a user provides a link to an art exhibition, use the web search tool to research it thoroughly. Then explain the artist, the exhibition, the genre, and related artists in a warm, accessible, and engaging way — as if giving a personal gallery tour to someone with no art background. Always be curious, enthusiastic, and educational. Avoid jargon unless you explain it. Suggest what to look for and why it matters.`;

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 3000;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  exhibitionUrl?: string;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { messages, exhibitionUrl } = req.body as ChatRequestBody;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required and must not be empty' });
      return;
    }

    // Build Anthropic message params, injecting the exhibition URL into the first user message
    let apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (exhibitionUrl) {
      const firstUserIdx = apiMessages.findIndex((m) => m.role === 'user');
      if (firstUserIdx !== -1) {
        const original = apiMessages[firstUserIdx].content as string;
        apiMessages[firstUserIdx] = {
          role: 'user',
          content: `I'm looking at this exhibition: ${exhibitionUrl}\n\n${original}`,
        };
      }
    }

    const callParams = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        } as Anthropic.Messages.WebSearchTool20250305,
      ],
    };

    // web_search_20250305 is a server-side tool — Anthropic handles searches
    // internally within the API call, so a single call is normally sufficient.
    let response = await getClient().messages.create({
      ...callParams,
      messages: apiMessages,
    });

    // pause_turn means the API's internal search loop hit its iteration cap.
    // Append what we got and make exactly one more call to let it finish.
    if (response.stop_reason === 'pause_turn') {
      apiMessages.push({ role: 'assistant', content: response.content });
      response = await getClient().messages.create({
        ...callParams,
        messages: apiMessages,
      });
    }

    const finalText =
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n') || "I wasn't able to complete the research. Please try again.";

    res.json({ role: 'assistant', content: finalText });
  } catch (error) {
    console.error('Chat error:', error);

    if (error instanceof Anthropic.AuthenticationError) {
      res.status(401).json({ error: 'Invalid API key. Check your ANTHROPIC_API_KEY.' });
    } else if (error instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
    } else if (error instanceof Anthropic.APIError) {
      res.status(500).json({ error: `API error: ${error.message}` });
    } else {
      res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  }
});

export default router;
