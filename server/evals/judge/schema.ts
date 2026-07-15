import { z } from 'zod';

export const JudgeSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      verdict: z.enum(['supported', 'unsupported', 'contradicted']),
      // Verbatim quote of the evidence span that supports/contradicts the
      // claim; empty string for 'unsupported'.
      evidence_quote: z.string(),
    }),
  ),
  // Did the response honestly acknowledge missing/unverifiable information
  // where the evidence was silent?
  acknowledges_missing_info: z.boolean(),
  // Is the response written in the requested language?
  language_matches: z.boolean(),
  sections_present: z.object({
    opening: z.boolean(),
    artist: z.boolean(),
    exhibition: z.boolean(),
    what_to_look_for: z.boolean(),
  }),
});

export type JudgeVerdict = z.infer<typeof JudgeSchema>;
