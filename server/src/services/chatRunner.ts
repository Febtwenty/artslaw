import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient, getMistralClient } from './llmClients';
import { tavilySearch } from './tavily';
import {
  anthropicWebSearchTool,
  mistralWebSearchTool,
  handleAnthropicToolUse,
  runWebSearchTool,
  dedupeSources,
  SearchFn,
  Source,
} from './webSearchTool';

export const CHAT_MODEL = 'claude-haiku-4-5';
export const MISTRAL_CHAT_MODEL = 'mistral-small-latest';
// Bounds how many search round-trips a single turn can make (cost/latency cap)
export const MAX_TOOL_ITERATIONS = 4;

export interface ToolCallRecord {
  iteration: number;
  query: string;
  argsValid: boolean;
  resultText: string;
  servedSourceUrls: string[];
}

export interface ChatRunResult {
  text: string;
  sources: Source[];
  toolCalls: ToolCallRecord[];
  iterations: number;
  stoppedAtIterationCap: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ChatRunnerEvents {
  // Route: writes an SSE frame per chunk. Eval harness: records TTFT + transcript.
  onText?: (t: string) => void;
}

export interface ChatRunnerDeps {
  // Defaults to real Tavily; the eval harness injects a fixture-replay stub.
  searchFn?: SearchFn;
}

export interface ChatRunParams {
  system: string;
  maxTokens: number;
}

export async function runClaudeChat(
  params: ChatRunParams & { messages: Anthropic.MessageParam[] },
  events: ChatRunnerEvents = {},
  deps: ChatRunnerDeps = {},
): Promise<ChatRunResult> {
  const searchFn = deps.searchFn ?? tavilySearch;

  // Custom, model-driven web_search tool — the server executes searches
  // against Tavily and feeds results back. Claude decides whether to
  // actually invoke search — simple contextual questions ("explain that
  // more") are answered directly without a search call.
  const tools: Anthropic.Tool[] = [anthropicWebSearchTool()];

  const callParams = {
    model: CHAT_MODEL,
    max_tokens: params.maxTokens,
    system: params.system,
    tools,
  };

  let text = '';
  const emit = (t: string) => {
    text += t;
    events.onText?.(t);
  };

  // Persists across tool-loop turns: a turn that continues the loop ends with a
  // tool_use (search) block, so the next turn's first text block must be split
  // off with a blank line or the resumed section (e.g. "## The Artist") merges
  // inline into the previous paragraph and CommonMark renders it as plain text.
  let prevBlockWasSearch = false;
  const runStream = async (msgs: Anthropic.MessageParam[]) => {
    const stream = getAnthropicClient().messages.stream({ ...callParams, messages: msgs });
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'text') {
          // Separate text resuming after a search block, but never add a leading
          // break (search-first turn) or double an existing one.
          if (prevBlockWasSearch && text.length > 0 && !text.endsWith('\n\n')) emit('\n\n');
          prevBlockWasSearch = false;
        } else {
          prevBlockWasSearch = true;
        }
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        emit(event.delta.text);
      }
    }
    return stream.finalMessage();
  };

  // Loop: run a turn, and if Claude asked to search, execute it against
  // Tavily and feed the result back, until it answers or we hit the bound.
  let current = params.messages;
  const allFinalMessages: Anthropic.Message[] = [];
  const seen = new Set<string>();
  const allSources: Source[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let iterations = 0;
  let lastStopReason: Anthropic.Message['stop_reason'] = null;
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const finalMsg = await runStream(current);
    iterations = i + 1;
    allFinalMessages.push(finalMsg);
    lastStopReason = finalMsg.stop_reason;
    if (finalMsg.stop_reason !== 'tool_use') break;
    const handled = await handleAnthropicToolUse(finalMsg, searchFn);
    if (!handled) break;
    for (const call of handled.calls) {
      toolCalls.push({ iteration: i + 1, ...call });
    }
    current = [...current, ...handled.toAppend];
    dedupeSources(seen, handled.sources, allSources);
  }

  const totalInput = allFinalMessages.reduce((s, m) => s + (m.usage?.input_tokens ?? 0), 0);
  const totalOutput = allFinalMessages.reduce((s, m) => s + (m.usage?.output_tokens ?? 0), 0);

  return {
    text,
    sources: allSources,
    toolCalls,
    iterations,
    stoppedAtIterationCap: iterations === MAX_TOOL_ITERATIONS && lastStopReason === 'tool_use',
    usage: { inputTokens: totalInput, outputTokens: totalOutput },
  };
}

export async function runMistralChat(
  params: ChatRunParams & { messages: { role: 'user' | 'assistant'; content: string }[] },
  events: ChatRunnerEvents = {},
  deps: ChatRunnerDeps = {},
): Promise<ChatRunResult> {
  const searchFn = deps.searchFn ?? tavilySearch;

  // Mistral Chat Completions API — stateless, symmetric with Claude. Full
  // message history is resent every turn; web_search is our own custom
  // tool executed against Tavily rather than Mistral's native web_search.
  const client = await getMistralClient();
  const tools = [mistralWebSearchTool()];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgs: any[] = [
    { role: 'system', content: params.system },
    ...params.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let text = '';
  const emit = (t: string) => {
    text += t;
    events.onText?.(t);
  };

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const seen = new Set<string>();
  const allSources: Source[] = [];
  const toolCalls: ToolCallRecord[] = [];
  let iterations = 0;
  let lastFinishReason: string | null | undefined = null;
  // Mistral has no per-block separator; bridge the paragraph->heading boundary
  // across a tool-call turn ourselves so a section resumed after a search
  // doesn't merge inline into the previous paragraph.
  let prevTurnWasTool = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    iterations = i + 1;
    const stream = await client.chat.stream({
      model: MISTRAL_CHAT_MODEL,
      messages: msgs,
      tools,
      maxTokens: params.maxTokens,
    });

    let textThisTurn = '';
    // The SDK's own streaming example overwrites (not appends/concatenates)
    // this on each chunk that carries tool call deltas — Mistral streams
    // each tool call already-complete rather than fragmenting arguments.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let latestToolCalls: any[] | null = null;
    let finishReason: string | null | undefined = null;

    for await (const event of stream) {
      const choice = event.data?.choices?.[0];
      if (!choice) continue;
      const content = choice.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        // First text chunk after a search turn: split it off with a blank line,
        // but never add a leading or doubled break.
        if (prevTurnWasTool && textThisTurn === '' && text.length > 0 && !text.endsWith('\n\n')) {
          emit('\n\n');
        }
        textThisTurn += content;
        emit(content);
      }
      if (choice.delta?.toolCalls) latestToolCalls = choice.delta.toolCalls;
      if (choice.finishReason) finishReason = choice.finishReason;
      if (event.data?.usage) {
        totalInputTokens += event.data.usage.promptTokens ?? 0;
        totalOutputTokens += event.data.usage.completionTokens ?? 0;
      }
    }

    lastFinishReason = finishReason;
    prevTurnWasTool = finishReason === 'tool_calls';
    if (finishReason !== 'tool_calls' || !latestToolCalls || latestToolCalls.length === 0) break;

    msgs.push({ role: 'assistant', content: textThisTurn || null, toolCalls: latestToolCalls });
    for (const call of latestToolCalls) {
      let query = '';
      let argsValid = false;
      try {
        const parsedQuery = JSON.parse(call.function.arguments || '{}').query;
        if (typeof parsedQuery === 'string') {
          query = parsedQuery;
          argsValid = parsedQuery.trim().length > 0;
        }
      } catch { /* malformed args — search with empty query, tool result explains failure */ }
      const { resultText, sources, rawResults } = await runWebSearchTool(query, searchFn);
      toolCalls.push({
        iteration: i + 1,
        query,
        argsValid,
        resultText,
        servedSourceUrls: rawResults.map((r) => r.url),
      });
      dedupeSources(seen, sources, allSources);
      msgs.push({ role: 'tool', name: call.function.name, content: resultText, toolCallId: call.id });
    }
  }

  return {
    text,
    sources: allSources,
    toolCalls,
    iterations,
    stoppedAtIterationCap: iterations === MAX_TOOL_ITERATIONS && lastFinishReason === 'tool_calls',
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
