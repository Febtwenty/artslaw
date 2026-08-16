# ArtSlaw

An AI-powered art tour guide. Paste a link to any museum or gallery exhibition and chat with ArtSlaw — your knowledgeable, friendly gallery companion.

ArtSlaw uses Claude (`claude-haiku-4-5`) or Mistral (`mistral-small-latest`) — switchable per conversation — with a Tavily-backed web search tool to research exhibitions in real time, then explains the artist, the works, the movement, and related artists in an accessible, engaging way. Tours are saved per user and can be shared as public read-only links.

---

## Features

- **Exhibition tours** — paste any gallery or museum URL and start a guided chat. Every tour follows a fixed structure (a short opening, then **The Artist(s)**, **The Exhibition**, **What to Look For**) and is strictly grounded: the model may only state facts found on the exhibition page or in its live web searches — memorized artist knowledge doesn't count, and thin evidence produces shorter sections rather than invented details
- **Free-text search** — type an artist, city, or exhibition name instead of a URL; the chat opens, ArtSlaw searches the web (Tavily + LLM extraction) and presents matching current exhibitions as cards in the conversation; refine the search by typing again, or tap a card to start the tour
- **Model toggle** — switch between Claude and Mistral per conversation (defaults to Mistral for each new tour); both share the same Tavily-backed `web_search` tool, called on demand by whichever model is active. The chosen provider is shown as a flag badge in the chat window and persisted with the saved conversation
- **Recent visits on the start screen** — signed-in users see a 3-across photo grid of their six most recently collected exhibitions above the blog picks, with a `View all →` link to `/collection`. Only visits with an uploaded photo appear (a visit carries no exhibition image of its own), so the section stays hidden until the first photo is added; tapping a tile opens that visit's detail panel in `/collection`
- **Discover** — surfaces upcoming exhibition recommendations based on artists you've already researched, scraped from contemporaryartlibrary.org with a 7-day cache
- **My Collection (gamification)** — stamp exhibitions you've actually visited with the **Collect this visit** button in the chat, and they appear at `/collection` in either a photo-first **Grid** (default) or a month-grouped **Timeline** — a segmented toggle switches between them and the choice is remembered in `localStorage`. On desktop the grid shows Discover-style cards; on mobile it's a bare Instagram-style image wall. Clicking any visit thumbnail — grid tile, timeline thumb, or start-screen tile — opens a **visit detail panel** (full-bleed on mobile, a centred modal from `sm` up) holding the full-resolution photo, the visit's details and every action: add/replace/remove photo, reopen the tour, un-collect. Collecting earns points (10 per exhibition, once per exhibition URL) toward six art-world levels (Gallery Newcomer → Art-World Legend), with one-time badge bonuses (First Visit, 5/10/20 Exhibitions, 3-in-one-month), a monthly visit streak (+5 per consecutive month), and an optional photo per visit (+5 the first time; center-cropped server-side to a 1200×1200 WebP for the lightbox plus a 480×480 WebP thumbnail for the grid/timeline). A clickable level chip lives in the header (desktop) and sidebar (mobile); crossing a level threshold triggers a confetti celebration. All awarding happens server-side; level/badge constants are duplicated in `server/src/config/gamification.ts` and `client/src/lib/gamification.ts` and must be kept in sync
- **Response feedback** — thumbs up/down below each assistant response; a down-vote opens a short reason-chip + optional comment form. Ratings are stored server-side as self-contained records (`message_feedback` collection) for reviewing response quality and comparing providers; the selection is remembered on the conversation and shown as a highlighted thumb
- **Conversation history** — all past tours are saved to MongoDB and listed in the sidebar
- **Shareable tours** — every tour gets a public `/tour/:id` link for read-only sharing
- **Authentication** — user accounts via Clerk
- **Per-user token usage caps** — daily and monthly limits enforced server-side, with a live usage indicator in the header (desktop) and sidebar (mobile)
- **Dark mode**
- **Blog** — admin users can generate AI-drafted exhibition write-ups via a two-phase Claude pipeline (research → format), then publish them to a server-rendered public blog at `/blog`
- **Evaluation suite** — offline evals for groundedness (LLM-as-judge against the exact evidence the model saw), tool-call accuracy, discovery quality, structure/language adherence, latency & cost — run per provider with baseline regression gating. See [`server/evals/README.md`](server/evals/README.md)

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)
- A [Mistral API key](https://console.mistral.ai) (for the Mistral model toggle)
- A [Tavily API key](https://tavily.com) (web search, used by both models)
- A [Clerk](https://clerk.com) application (for auth)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (for conversation persistence)

---

## Setup

### 1. Clone and configure environment

Copy the templates and fill in your own keys: `.env.example` → `.env` (server) and `client/.env.example` → `client/.env.local` (client).

**Server** (root `.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
TAVILY_API_KEY=tvly-...
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/artslaw?retryWrites=true&w=majority

# Optional: comma-separated Clerk user IDs that bypass all token limits
UNLIMITED_USER_IDS=user_abc123,user_xyz456
```

**Client** (`client/.env.local`):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

### 2. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

---

## Running locally

Open **two terminal windows** from the project root:

**Terminal 1 — Backend (Express server on port 3001):**
```bash
cd server && npm run dev
```

**Terminal 2 — Frontend (Vite dev server on port 5173):**
```bash
cd client && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

The Vite dev server proxies `/api/*` requests to the Express backend automatically.

### Known console warnings

Firefox logs `Cookie "_cfuvid" has been rejected for invalid domain` roughly every minute, both locally and in production. This comes from Clerk's Cloudflare edge, not from this codebase: ClerkJS refreshes the session token every ~50 s against the Clerk Frontend API, and each response carries a `Set-Cookie: _cfuvid=…; Domain=clerkprod-cloudflare.net` header whose `Domain` doesn't match the serving host, so the browser rejects it (Chrome does the same, silently). The cookie is Cloudflare's rate-limiting helper; its rejection has **no effect** on auth or any feature. There is nothing to fix here — the issue has been reported to Clerk. To hide it while developing, type `-_cfuvid` in the Firefox DevTools console filter box.

---

## Usage

1. Sign in with your Clerk account
2. Paste any exhibition URL — or type an artist, city, or exhibition name and pick from the exhibition cards that appear in the chat — and click **Begin the Tour**
3. ArtSlaw researches the exhibition via live web search and starts the conversation
4. Ask follow-up questions — about the artist, genre, related works, what to look for
5. Open **Discover** (search icon in the header) to browse recommended upcoming shows based on artists you've toured

---

## Token usage limits

Default caps (defined in `server/src/config/limits.ts`):

| Period  | Token limit |
|---------|-------------|
| Daily   | 200,000     |
| Monthly | 2,000,000   |

To change the limits, edit `DEFAULT_LIMITS` in `server/src/config/limits.ts` and redeploy.

To exempt specific users from all limits, add their Clerk user IDs (comma-separated) to the `UNLIMITED_USER_IDS` environment variable. Find a user's ID in the Clerk dashboard.

---

## Project structure

```
artslaw/
├── client/                   # React 18 + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── DiscoverPage.tsx
│   │   │   ├── ExhibitionLinkInput.tsx
│   │   │   ├── InputBar.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SignInPage.tsx
│   │   │   ├── TourPage.tsx
│   │   │   ├── CollectionPage.tsx    # /collection — visited-exhibitions grid/timeline + level/badges
│   │   │   ├── VisitDetail.tsx       # per-visit detail modal (photo, actions) — all breakpoints
│   │   │   ├── RecentVisitsGrid.tsx  # start-screen grid of recently collected exhibitions
│   │   │   ├── CollectStampButton.tsx
│   │   │   ├── GamificationChip.tsx
│   │   │   ├── LevelUpOverlay.tsx
│   │   │   ├── UsageIndicator.tsx
│   │   │   ├── LogoWordmark.tsx
│   │   │   ├── BlogPage.tsx
│   │   │   ├── BlogAdmin.tsx
│   │   │   ├── PrivacyPage.tsx
│   │   │   └── TermsPage.tsx
│   │   ├── hooks/
│   │   │   ├── useChatTour.ts
│   │   │   ├── useConversationHistory.ts
│   │   │   ├── useDarkMode.ts
│   │   │   ├── useGamification.ts    # visits/points/badges state + collect/photo mutations
│   │   │   └── useUsage.ts
│   │   ├── lib/
│   │   │   └── gamification.ts       # levels/badges/points constants (sync with server copy)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts        # Proxies /api → localhost:3001
├── server/                   # Express + Anthropic SDK backend
│   ├── evals/                # Offline eval suite (fixtures, judge, baselines) — see evals/README.md
│   └── src/
│       ├── config/
│       │   ├── limits.ts     # Daily/monthly token caps
│       │   └── gamification.ts  # levels/badges/points constants + award logic (sync with client copy)
│       ├── db/
│       │   ├── usage.ts      # token_usage collection helpers
│       │   ├── visits.ts     # exhibition_visits + user_stats collection helpers
│       │   ├── feedback.ts   # message_feedback collection helpers (thumbs up/down)
│       │   └── blog.ts       # blog posts collection helpers
│       ├── services/
│       │   ├── tavily.ts         # Tavily search API wrapper
│       │   ├── webSearchTool.ts  # shared web_search tool schema + loop helpers
│       │   ├── chatRunner.ts     # provider tool loops (Claude/Mistral), shared by route + evals
│       │   ├── discovery.ts      # free-text discovery core (search + extraction + URL filter)
│       │   ├── pageContent.ts    # exhibition page fetch/extract
│       │   └── llmClients.ts     # lazy Anthropic/Mistral client getters
│       ├── middleware/
│       │   └── checkUsageLimits.ts  # shared 429 guard for LLM routes
│       ├── db.ts             # MongoDB connection
│       ├── prompts.ts        # All LLM prompt text (system prompts, templates, tool descriptions)
│       ├── index.ts
│       └── routes/
│           ├── chat.ts        # POST /api/chat (streaming; SSE + auth around chatRunner)
│           ├── conversations.ts
│           ├── discoveries.ts # GET /api/discoveries (CAL scraper)
│           ├── exhibitionSearch.ts # POST /api/exhibition-search (free-text → exhibition candidates)
│           ├── title.ts
│           ├── tour.ts        # GET /api/tour/:id (public share)
│           ├── usage.ts       # GET /api/usage
│           ├── visits.ts      # GET/POST /api/visits, DELETE /api/visits/:id, POST/DELETE /api/visits/:id/photo
│           ├── feedback.ts    # POST /api/feedback (thumbs up/down on assistant messages)
│           ├── blog.ts        # Blog CRUD, AI generation, public pages
│           └── favicon.ts
├── .env                      # Your secrets (not committed)
└── render.yaml               # Render deployment config
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic SDK (`@anthropic-ai/sdk`), `claude-haiku-4-5` · Mistral SDK (`@mistralai/mistralai`), `mistral-small-latest` |
| Search | Tavily Search API, called via a shared model-driven `web_search` tool used by both providers |
| Auth | Clerk |
| Database | MongoDB (Atlas) |
| Scraping | Cheerio (CAL exhibition data) |
| Image Processing | `sharp` (WebP conversion/resizing), `multer` (file upload) |
| Markdown | `react-markdown` + `remark-gfm` (client) · `marked` (server blog pages) |

---

## Production build

From the project root (installs and builds both client and server in one step):

```bash
npm run build
```

Or manually:

```bash
cd server && npm run build
cd ../client && npm run build
```

The client build outputs to `client/dist/`, served as static files by the Express server in production.

---

## Evaluation suite

Offline evals live in `server/evals/` (excluded from the production build) and exercise the **production** chat tool loop and discovery pipeline directly. Groundedness is scored by an LLM judge (`claude-sonnet-5`, structured outputs) against the exact web evidence each response was generated from; tool-call behavior, discovery URL-hallucination filtering, structure/language, latency, and cost are scored deterministically. The full suite runs once per provider (Claude / Mistral) over identical scenarios and is gated against checked-in per-provider baselines — making provider or prompt changes regression-testable.

```bash
cd server
npm run eval            # replay recorded web fixtures, judge, gate vs baseline (exit 1 on regression)
npm run eval:live       # against the live web
npm run eval:record     # refresh fixtures
npm run eval:baseline   # re-baseline (deliberate act, commit the JSONs)
```

See [`server/evals/README.md`](server/evals/README.md) for metrics, fixtures, and thresholds.

---

## Security

Found a vulnerability? Please report it privately — see [`SECURITY.md`](SECURITY.md).

---

## License

[AGPL-3.0](LICENSE). You are free to use, study, modify, and share this code; if you run a modified version as a network service, you must make your modified source available to its users under the same license.
