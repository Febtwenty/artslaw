export type Provider = 'claude' | 'mistral';
export type ScenarioKind = 'initial-tour' | 'follow-up' | 'discovery';
export type EvidenceMode = 'replay' | 'live' | 'record';

export interface EvalScenario {
  id: string;
  kind: ScenarioKind;
  language: 'en' | 'de';
  // initial-tour only — the exhibition page URL (fetched live in --live/--record,
  // served from fixtures/pages/<id>.txt in replay).
  exhibitionUrl?: string;
  // The last user turn (chat kinds) or the discovery query.
  userMessage: string;
  // follow-up only — conversation history preceding userMessage.
  priorMessages?: { role: 'user' | 'assistant'; content: string }[];
  fixtures: {
    // 'auto' → fixtures/pages/<id>.txt; null → simulate page-fetch failure
    // (fetchPageContent returning null); omit for follow-up/discovery.
    page?: 'auto' | null;
    // 'auto' → fixtures/tavily/<id>.json; 'empty' → stub always returns []
    // (exercises WEB_SEARCH_NO_RESULTS_MESSAGE / the no-LLM-cost discovery path).
    tavily?: 'auto' | 'empty';
  };
  expect: {
    // Must the model call web_search this turn? 'either' = don't score.
    toolCall: boolean | 'either';
    // Does the 4-section tour structure requirement apply to this response?
    structure: boolean;
    // No-evidence scenarios: honest hedging expected instead of groundedness.
    hedging?: boolean;
    // discovery only
    minValidatedCandidates?: number;
    maxValidatedCandidates?: number;
  };
}
