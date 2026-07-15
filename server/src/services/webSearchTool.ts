import Anthropic from '@anthropic-ai/sdk';
import { tavilySearch, TavilyResult } from './tavily';
import {
  WEB_SEARCH_TOOL_DESCRIPTION,
  WEB_SEARCH_QUERY_PARAM_DESCRIPTION,
  WEB_SEARCH_NO_RESULTS_MESSAGE,
  formatWebSearchResults,
} from '../prompts';

export const WEB_SEARCH_TOOL_NAME = 'web_search';
export { WEB_SEARCH_TOOL_DESCRIPTION };
export const WEB_SEARCH_TOOL_PARAMETERS = {
  type: 'object' as const,
  properties: {
    query: { type: 'string', description: WEB_SEARCH_QUERY_PARAM_DESCRIPTION },
  },
  required: ['query'],
};

export interface Source {
  title: string;
  url: string;
}

export function anthropicWebSearchTool(): Anthropic.Tool {
  return {
    name: WEB_SEARCH_TOOL_NAME,
    description: WEB_SEARCH_TOOL_DESCRIPTION,
    input_schema: WEB_SEARCH_TOOL_PARAMETERS,
  };
}

export function mistralWebSearchTool() {
  return {
    type: 'function' as const,
    function: {
      name: WEB_SEARCH_TOOL_NAME,
      description: WEB_SEARCH_TOOL_DESCRIPTION,
      parameters: WEB_SEARCH_TOOL_PARAMETERS,
    },
  };
}

// Injectable search backend — production always uses Tavily; the offline eval
// harness substitutes a fixture-replay implementation.
export type SearchFn = (query: string, maxResults?: number) => Promise<TavilyResult[]>;

export async function runWebSearchTool(
  query: string,
  searchFn: SearchFn = tavilySearch,
): Promise<{ resultText: string; sources: Source[]; rawResults: TavilyResult[] }> {
  const results = await searchFn(query);
  if (results.length === 0) {
    return {
      resultText: WEB_SEARCH_NO_RESULTS_MESSAGE,
      sources: [],
      rawResults: [],
    };
  }
  const resultText = formatWebSearchResults(results);
  return {
    resultText,
    sources: results.map((r) => ({ title: r.title, url: r.url })),
    rawResults: results,
  };
}

export function dedupeSources(seen: Set<string>, sources: Source[], into: Source[]): void {
  for (const s of sources) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      into.push(s);
    }
  }
}

// Per-call record of what the tool actually did — captured by the eval
// harness to check argument validity and to build the evidence bundle.
export interface WebSearchCall {
  query: string;
  argsValid: boolean;
  resultText: string;
  servedSourceUrls: string[];
}

export async function handleAnthropicToolUse(
  message: Anthropic.Message,
  searchFn: SearchFn = tavilySearch,
): Promise<{
  toAppend: [Anthropic.MessageParam, Anthropic.MessageParam];
  sources: Source[];
  calls: WebSearchCall[];
} | null> {
  if (message.stop_reason !== 'tool_use') return null;

  const toolUseBlocks = message.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (toolUseBlocks.length === 0) return null;

  const sources: Source[] = [];
  const calls: WebSearchCall[] = [];
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of toolUseBlocks) {
    const rawQuery = (block.input as { query?: unknown }).query;
    const query = typeof rawQuery === 'string' ? rawQuery : '';
    const { resultText, sources: blockSources, rawResults } = await runWebSearchTool(query, searchFn);
    sources.push(...blockSources);
    calls.push({
      query,
      argsValid: typeof rawQuery === 'string' && rawQuery.trim().length > 0,
      resultText,
      servedSourceUrls: rawResults.map((r) => r.url),
    });
    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
  }

  return {
    toAppend: [
      { role: 'assistant', content: message.content },
      { role: 'user', content: toolResults },
    ],
    sources,
    calls,
  };
}
