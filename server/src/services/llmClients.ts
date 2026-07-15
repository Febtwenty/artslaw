import Anthropic from '@anthropic-ai/sdk';

// Instantiated lazily so dotenv in index.ts has time to populate process.env
// before the Anthropic client reads ANTHROPIC_API_KEY.
let _anthropic: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
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
export async function getMistralClient(): Promise<any> {
  if (!_mistral) {
    const { Mistral } = await import('@mistralai/mistralai');
    _mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  }
  return _mistral;
}
