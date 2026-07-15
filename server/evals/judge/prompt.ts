import { MAX_EVIDENCE_CHARS } from '../config';
import { EvidenceItem } from '../harness/scenarioRunner';

export const JUDGE_SYSTEM_PROMPT = `You are a strict fact-checking judge for an AI art-tour guide.

You receive the EVIDENCE the guide model actually saw (the exhibition page text and/or web search results) and the RESPONSE it produced. Your job:

1. Extract every discrete factual claim from the RESPONSE — biographical facts (birth year, nationality, training, career milestones), dates, counts of works, work titles, media, venue/institution names, staging or installation details, and reception/acclaim claims. Split compound sentences into separate claims. Do NOT extract subjective interpretation, viewing advice, or general art-historical framing that makes no checkable assertion.
2. For each claim, judge it AGAINST THE EVIDENCE ONLY:
   - "supported" — the evidence states it (paraphrase is fine, meaning must match).
   - "unsupported" — the evidence is silent on it. Your own world knowledge does NOT count as support, even if you know the claim is true.
   - "contradicted" — the evidence says otherwise.
   An "earlier conversation" evidence block counts fully: for follow-up answers (summaries, elaborations), a claim stated in the earlier conversation is "supported" — faithfulness to the conversation is exactly what is being graded there.
   For supported/contradicted claims, copy the relevant evidence span into evidence_quote (verbatim, shortened with … is fine). For unsupported claims use an empty string.
3. Report whether the response honestly acknowledges gaps: acknowledges_missing_info is true if the response explicitly flags information as unavailable, unverified, or not specified where the evidence is silent (phrases like "the available information doesn't specify"). If the evidence covers everything the response says, or the response papers over gaps with confident prose, it is false.
4. Report language_matches: whether the response is written in the requested language.
5. Report sections_present: whether the response contains (a) an opening passage before the first section header, (b) an artist section (e.g. "The Artist" / "Der Künstler"), (c) an exhibition section ("The Exhibition" / "Die Ausstellung"), (d) a what-to-look-for section ("What to Look For" / "Worauf man achten sollte"). Judge by content and headers, tolerating minor header variations.

Be rigorous and pedantic. A plausible-sounding detail that the evidence does not contain is "unsupported" — that is the exact failure mode this evaluation exists to catch.`;

export function buildJudgeUserMessage(params: {
  evidence: EvidenceItem[];
  evidenceAvailable: boolean;
  responseText: string;
  language: 'en' | 'de';
}): string {
  let evidenceText = '';
  if (params.evidence.length === 0) {
    evidenceText = '(none — no page content was available and no search returned results)';
  } else {
    const parts: string[] = [];
    let used = 0;
    for (let i = 0; i < params.evidence.length; i++) {
      const item = params.evidence[i];
      const block = `[EVIDENCE ${i + 1}: ${item.label}]\n${item.text}`;
      if (used + block.length > MAX_EVIDENCE_CHARS) break;
      parts.push(block);
      used += block.length;
    }
    evidenceText = parts.join('\n\n');
  }

  return (
    `Requested response language: ${params.language === 'de' ? 'German' : 'English'}\n` +
    `Evidence available to the guide model: ${params.evidenceAvailable ? 'yes' : 'no'}\n\n` +
    `=== EVIDENCE ===\n${evidenceText}\n\n` +
    `=== RESPONSE ===\n${params.responseText}`
  );
}
