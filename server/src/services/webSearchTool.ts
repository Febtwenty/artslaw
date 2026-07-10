import Anthropic from '@anthropic-ai/sdk';
import { tavilySearch } from './tavily';
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

export async function runWebSearchTool(query: string): Promise<{ resultText: string; sources: Source[] }> {
  const results = await tavilySearch(query);
  if (results.length === 0) {
    return {
      resultText: WEB_SEARCH_NO_RESULTS_MESSAGE,
      sources: [],
    };
  }
  const resultText = formatWebSearchResults(results);
  return { resultText, sources: results.map((r) => ({ title: r.title, url: r.url })) };
}

export function dedupeSources(seen: Set<string>, sources: Source[], into: Source[]): void {
  for (const s of sources) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      into.push(s);
    }
  }
}

export async function handleAnthropicToolUse(
  message: Anthropic.Message,
): Promise<{ toAppend: [Anthropic.MessageParam, Anthropic.MessageParam]; sources: Source[] } | null> {
  if (message.stop_reason !== 'tool_use') return null;

  const toolUseBlocks = message.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (toolUseBlocks.length === 0) return null;

  const sources: Source[] = [];
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of toolUseBlocks) {
    const query = (block.input as { query?: string }).query ?? '';
    const { resultText, sources: blockSources } = await runWebSearchTool(query);
    sources.push(...blockSources);
    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
  }

  return {
    toAppend: [
      { role: 'assistant', content: message.content },
      { role: 'user', content: toolResults },
    ],
    sources,
  };
}
