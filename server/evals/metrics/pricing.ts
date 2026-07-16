// USD per million tokens. App models + the judge.
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICES: Record<string, ModelPrice> = {
  // Anthropic published pricing (verified 2026-07)
  'claude-haiku-4-5': { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  'claude-opus-4-8': { inputPerMTok: 5.0, outputPerMTok: 25.0 },
  // Sticker price; an introductory $2/$10 rate applies through 2026-08-31,
  // so reported judge cost slightly overestimates until then.
  'claude-sonnet-5': { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  // TODO: verify against https://mistral.ai/pricing before trusting cost
  // numbers for Mistral — placeholder values below.
  'mistral-small-latest': { inputPerMTok: 0.15, outputPerMTok: 0.6 },
};

export function costUsd(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  const price = PRICES[model];
  if (!price) throw new Error(`No price table entry for model "${model}"`);
  return (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000;
}
