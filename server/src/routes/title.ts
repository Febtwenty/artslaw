import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

router.post('/', async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text) { res.status(400).json({ error: 'text required' }); return; }

  try {
    const msg = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 40,
      messages: [{
        role: 'user',
        content: `From this art guide text, extract the artist name and exhibition name. Return ONLY the title in this format: "Artist Name - Exhibition Name". If you cannot determine the artist, return just the exhibition name. No quotes, no explanation.\n\nText: ${text.slice(0, 2000)}`,
      }],
    });
    const title = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : 'Untitled Tour';
    res.json({ title });
  } catch {
    res.status(500).json({ title: 'Untitled Tour' });
  }
});

export default router;
