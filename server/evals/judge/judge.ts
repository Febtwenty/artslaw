import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient } from '../../src/services/llmClients';
import { JUDGE_MODEL, JUDGE_MAX_TOKENS } from '../config';
import { RunRecord } from '../harness/scenarioRunner';
import { JudgeSchema, JudgeVerdict } from './schema';
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserMessage } from './prompt';

export interface JudgeOutcome {
  verdict: JudgeVerdict | null;
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

export async function judgeRun(record: RunRecord, language: 'en' | 'de'): Promise<JudgeOutcome> {
  if (record.kind === 'discovery' || record.error || !record.responseText) {
    return { verdict: null, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  try {
    const message = await getAnthropicClient().messages.parse({
      model: JUDGE_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: JUDGE_SYSTEM_PROMPT,
      output_config: { format: zodOutputFormat(JudgeSchema) },
      messages: [
        {
          role: 'user',
          content: buildJudgeUserMessage({
            evidence: record.evidence ?? [],
            evidenceAvailable: record.evidenceAvailable ?? false,
            responseText: record.responseText,
            language,
          }),
        },
      ],
    });

    return {
      verdict: message.parsed_output ?? null,
      usage: {
        inputTokens: message.usage?.input_tokens ?? 0,
        outputTokens: message.usage?.output_tokens ?? 0,
      },
      ...(message.parsed_output ? {} : { error: 'judge returned no parsed output' }),
    };
  } catch (err) {
    return {
      verdict: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
