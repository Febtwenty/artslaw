import { Router, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import { recordUsage } from '../db/usage';
import { checkUsageLimits } from '../middleware/checkUsageLimits';
import { runDiscovery } from '../services/discovery';

export type { ExhibitionCandidate } from '../services/discovery';

const router = Router();

const MAX_QUERY_LENGTH = 200;

interface ExhibitionSearchRequestBody {
  query?: string;
  language?: 'en' | 'de';
  provider?: 'claude' | 'mistral';
}

router.post('/', checkUsageLimits, async (req: Request, res: Response) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = req.body as ExhibitionSearchRequestBody;
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > MAX_QUERY_LENGTH) {
      res.status(400).json({ error: 'query is required and must be at most 200 characters' });
      return;
    }
    const provider = body.provider === 'mistral' ? 'mistral' : 'claude';
    const lang = body.language === 'de' ? 'de' : 'en';

    console.log(`[exhibition-search] query="${query}"`);
    const result = await runDiscovery(query, lang, provider);

    if (result.usage.inputTokens > 0 || result.usage.outputTokens > 0) {
      console.log(
        `[exhibition-search] provider=${provider} input=${result.usage.inputTokens} output=${result.usage.outputTokens}`,
      );
      // Fire-and-forget — don't hold the response on the usage write
      recordUsage(userId, result.usage.inputTokens, result.usage.outputTokens)
        .catch(err => console.error('[usage] record failed:', err));
    }

    if (!result.parseOk) {
      console.error('[exhibition-search] unparseable LLM output:', result.rawText.slice(0, 300));
      res.status(500).json({ error: 'Could not process search results.' });
      return;
    }

    res.json({ candidates: result.candidates });
  } catch (error) {
    console.error('Exhibition search error:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

export default router;
