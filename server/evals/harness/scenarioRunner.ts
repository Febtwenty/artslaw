import Anthropic from '@anthropic-ai/sdk';
import {
  runClaudeChat,
  runMistralChat,
  ToolCallRecord,
} from '../../src/services/chatRunner';
import { runDiscovery, ExhibitionCandidate } from '../../src/services/discovery';
import { Source } from '../../src/services/webSearchTool';
import { WEB_SEARCH_NO_RESULTS_MESSAGE } from '../../src/prompts';
import { CHAT_SYSTEM_PROMPTS, buildChatInitialUserMessage } from '../../src/prompts';
import { INITIAL_MAX_TOKENS, FOLLOWUP_MAX_TOKENS } from '../config';
import { EvalScenario, EvidenceMode, Provider } from '../scenarios/types';
import { createSearchEnv } from './searchStub';

export interface EvidenceItem {
  label: string;
  text: string;
}

export interface DiscoveryRecord {
  parseOk: boolean;
  proposedCount: number;
  validatedCount: number;
  candidates: ExhibitionCandidate[];
  tavilyResultCount: number;
  tavilyQuery: string;
  rawText: string;
}

export interface RunRecord {
  scenarioId: string;
  kind: EvalScenario['kind'];
  provider: Provider;
  repeatIndex: number;
  mode: EvidenceMode;
  // chat kinds
  responseText?: string;
  sources?: Source[];
  toolCalls?: ToolCallRecord[];
  iterations?: number;
  stoppedAtIterationCap?: boolean;
  pageContent?: string | null;
  evidence?: EvidenceItem[];
  evidenceAvailable?: boolean;
  // discovery kind
  discovery?: DiscoveryRecord;
  latencyMs: number;
  ttftMs: number | null;
  usage: { inputTokens: number; outputTokens: number };
  error?: string;
}

function buildEvidence(pageContent: string | null | undefined, toolCalls: ToolCallRecord[]): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  if (typeof pageContent === 'string' && pageContent.length > 0) {
    evidence.push({ label: 'exhibition page', text: pageContent });
  }
  for (const call of toolCalls) {
    if (call.resultText === WEB_SEARCH_NO_RESULTS_MESSAGE) continue;
    evidence.push({ label: `web_search "${call.query}"`, text: call.resultText });
  }
  return evidence;
}

export async function runScenario(
  scenario: EvalScenario,
  provider: Provider,
  mode: EvidenceMode,
  repeatIndex: number,
): Promise<RunRecord> {
  const env = createSearchEnv(scenario, mode);
  const base = {
    scenarioId: scenario.id,
    kind: scenario.kind,
    provider,
    repeatIndex,
    mode,
  };

  try {
    if (scenario.kind === 'discovery') {
      const t0 = Date.now();
      const result = await runDiscovery(scenario.userMessage, scenario.language, provider, {
        searchFn: env.searchFn,
      });
      const latencyMs = Date.now() - t0;
      env.finalize();
      return {
        ...base,
        discovery: {
          parseOk: result.parseOk,
          proposedCount: result.proposedCount,
          validatedCount: result.validatedCount,
          candidates: result.candidates,
          tavilyResultCount: result.tavilyResults.length,
          tavilyQuery: result.tavilyQuery,
          rawText: result.rawText,
        },
        latencyMs,
        ttftMs: null,
        usage: result.usage,
      };
    }

    // Chat kinds — mirror the route's message building exactly (chat.ts).
    const system = CHAT_SYSTEM_PROMPTS[scenario.language];
    let pageContent: string | null | undefined;
    let messages: Anthropic.MessageParam[];

    if (scenario.kind === 'initial-tour') {
      pageContent = await env.getPage(scenario.exhibitionUrl!);
      messages = [
        ...(scenario.priorMessages ?? []),
        {
          role: 'user',
          content: buildChatInitialUserMessage({
            exhibitionUrl: scenario.exhibitionUrl!,
            pageContent,
            original: scenario.userMessage,
          }),
        },
      ];
    } else {
      messages = [...(scenario.priorMessages ?? []), { role: 'user', content: scenario.userMessage }];
    }

    const maxTokens = scenario.kind === 'initial-tour' ? INITIAL_MAX_TOKENS : FOLLOWUP_MAX_TOKENS;

    let ttftMs: number | null = null;
    const t0 = Date.now();
    const onText = () => {
      if (ttftMs === null) ttftMs = Date.now() - t0;
    };

    const result =
      provider === 'claude'
        ? await runClaudeChat({ messages, system, maxTokens }, { onText }, { searchFn: env.searchFn })
        : await runMistralChat(
            {
              messages: messages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content as string,
              })),
              system,
              maxTokens,
            },
            { onText },
            { searchFn: env.searchFn },
          );

    const latencyMs = Date.now() - t0;
    env.finalize();

    const evidenceAvailable =
      (typeof pageContent === 'string' && pageContent.length > 0) ||
      result.toolCalls.some((c) => c.servedSourceUrls.length > 0);

    return {
      ...base,
      responseText: result.text,
      sources: result.sources,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
      stoppedAtIterationCap: result.stoppedAtIterationCap,
      pageContent,
      evidence: buildEvidence(pageContent, result.toolCalls),
      evidenceAvailable,
      latencyMs,
      ttftMs,
      usage: result.usage,
    };
  } catch (err) {
    return {
      ...base,
      latencyMs: 0,
      ttftMs: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
