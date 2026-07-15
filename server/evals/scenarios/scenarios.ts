import { EvalScenario } from './types';

// Canned conversation history for follow-up scenarios. Kept short but concrete
// so "elaborate" follow-ups have real material and "new artist" follow-ups
// genuinely require a fresh search.
const EMIN_TOUR_EXCERPT = `Tracey Emin's exhibition at Tate Modern brings together four decades of her work.

**The Artist** — Tracey Emin (born 1963 in London, raised in Margate) rose to prominence among the Young British Artists in the 1990s. Her work is unflinchingly autobiographical, spanning painting, drawing, film, neon and sculpture.

**The Exhibition** — The show traces her career from early monoprints to recent large-scale paintings, including works dealing with illness, love and survival.

**What to Look For** — Notice how the rawness of the brushwork carries emotion: unfinished edges and dripping paint are deliberate choices, not accidents.`;

const WIEN1900_TOUR_EXCERPT = `Die Dauerausstellung „Wien 1900. Aufbruch in die Moderne" im Leopold Museum zeigt die Wiener Moderne auf drei Ebenen.

**Der Künstler** — Im Zentrum stehen Egon Schiele und Gustav Klimt; das Leopold Museum beherbergt die weltweit größte Egon-Schiele-Sammlung.

**Die Ausstellung** — Rund 1300 Exponate spannen den Bogen von der Secession über das Kunsthandwerk der Wiener Werkstätte bis zum Expressionismus.

**Worauf man achten sollte** — Achten Sie auf den Kontrast zwischen Klimts ornamentaler Fläche und Schieles nervöser Linie — zwei Antworten auf dieselbe Epoche.`;

export const SCENARIOS: EvalScenario[] = [
  // --- Initial tours (evidence: real exhibition pages, recorded as fixtures) ---
  {
    id: 'tour-emin-en',
    kind: 'initial-tour',
    language: 'en',
    exhibitionUrl: 'https://www.tate.org.uk/whats-on/tate-modern/tracey-emin',
    userMessage: 'Give me a tour of this exhibition.',
    fixtures: { page: 'auto', tavily: 'auto' },
    expect: { toolCall: 'either', structure: true },
  },
  {
    id: 'tour-mendieta-en',
    kind: 'initial-tour',
    language: 'en',
    exhibitionUrl: 'https://www.tate.org.uk/whats-on/tate-modern/ana-mendieta',
    userMessage: 'I know nothing about this artist. What should I expect?',
    fixtures: { page: 'auto', tavily: 'auto' },
    expect: { toolCall: 'either', structure: true },
  },
  {
    id: 'tour-wien1900-de',
    kind: 'initial-tour',
    language: 'de',
    exhibitionUrl: 'https://www.leopoldmuseum.org/de/ausstellungen/107/wien-1900',
    userMessage: 'Führe mich durch diese Ausstellung.',
    fixtures: { page: 'auto', tavily: 'auto' },
    expect: { toolCall: 'either', structure: true },
  },
  {
    id: 'tour-albertina250-de',
    kind: 'initial-tour',
    language: 'de',
    exhibitionUrl: 'https://www.albertina.at/ausstellungen/250-jahre-albertina/',
    userMessage: 'Was erwartet mich hier? Ich besuche die Ausstellung morgen.',
    fixtures: { page: 'auto', tavily: 'auto' },
    expect: { toolCall: 'either', structure: true },
  },

  // --- Edge cases ---
  {
    // Page fetch fails (page: null) — the model must fall back to web_search.
    id: 'tour-no-page-en',
    kind: 'initial-tour',
    language: 'en',
    exhibitionUrl: 'https://www.tate.org.uk/whats-on/tate-modern/ana-mendieta',
    userMessage: 'Give me a tour of this exhibition.',
    fixtures: { page: null, tavily: 'auto' },
    expect: { toolCall: true, structure: true },
  },
  {
    // No page AND every search returns nothing — honest hedging expected
    // instead of a confidently fabricated tour.
    id: 'tour-no-evidence-en',
    kind: 'initial-tour',
    language: 'en',
    exhibitionUrl: 'https://www.tate.org.uk/whats-on/tate-modern/ana-mendieta',
    userMessage: 'Give me a tour of this exhibition.',
    fixtures: { page: null, tavily: 'empty' },
    expect: { toolCall: 'either', structure: false, hedging: true },
  },

  // --- Follow-ups ---
  {
    // Pure elaboration — searching here is a tool-use failure.
    id: 'followup-elaborate-en',
    kind: 'follow-up',
    language: 'en',
    userMessage: 'Can you summarize all of that in three sentences?',
    priorMessages: [
      { role: 'user', content: 'Give me a tour of the Tracey Emin exhibition at Tate Modern.' },
      { role: 'assistant', content: EMIN_TOUR_EXCERPT },
    ],
    fixtures: { tavily: 'empty' },
    expect: { toolCall: false, structure: false },
  },
  {
    // A different artist — genuinely requires new information.
    id: 'followup-newartist-en',
    kind: 'follow-up',
    language: 'en',
    userMessage: 'Interesting. What is Marina Abramović exhibiting at the moment? Please check.',
    priorMessages: [
      { role: 'user', content: 'Give me a tour of the Tracey Emin exhibition at Tate Modern.' },
      { role: 'assistant', content: EMIN_TOUR_EXCERPT },
    ],
    fixtures: { tavily: 'auto' },
    expect: { toolCall: true, structure: false },
  },
  {
    id: 'followup-elaborate-de',
    kind: 'follow-up',
    language: 'de',
    userMessage: 'Fasse das bitte in drei Sätzen zusammen.',
    priorMessages: [
      { role: 'user', content: 'Führe mich durch die Ausstellung „Wien 1900" im Leopold Museum.' },
      { role: 'assistant', content: WIEN1900_TOUR_EXCERPT },
    ],
    fixtures: { tavily: 'empty' },
    expect: { toolCall: false, structure: false },
  },

  // --- Discovery (free-text exhibition search) ---
  {
    id: 'discovery-vienna-en',
    kind: 'discovery',
    language: 'en',
    userMessage: 'exhibitions in Vienna',
    fixtures: { tavily: 'auto' },
    expect: { toolCall: 'either', structure: false, minValidatedCandidates: 1 },
  },
  {
    id: 'discovery-berlin-de',
    kind: 'discovery',
    language: 'de',
    userMessage: 'Ausstellungen in Berlin',
    fixtures: { tavily: 'auto' },
    expect: { toolCall: 'either', structure: false, minValidatedCandidates: 1 },
  },
  {
    // Nonsense query — the pipeline must return zero candidates, not invent.
    id: 'discovery-nonsense-en',
    kind: 'discovery',
    language: 'en',
    userMessage: 'asdkfjh qwerzxcv 998877 blorptral',
    fixtures: { tavily: 'auto' },
    expect: { toolCall: 'either', structure: false, maxValidatedCandidates: 0 },
  },
];
