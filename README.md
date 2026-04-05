# ArtSlaw

An AI-powered art tour guide. Paste a link to any museum or gallery exhibition and chat with ArtSlaw — your knowledgeable, friendly gallery companion.

ArtSlaw uses Claude (`claude-haiku-4-5`) with live web search to research exhibitions in real time, then explains the artist, the works, the movement, and related artists in an accessible, engaging way. Tours are saved per user and can be shared as public read-only links.

---

## Features

- **Exhibition tours** — paste any gallery or museum URL and start a guided chat
- **Discover** — surfaces upcoming exhibition recommendations based on artists you've already researched, scraped from contemporaryartlibrary.org with a 7-day cache
- **Conversation history** — all past tours are saved to MongoDB and listed in the sidebar
- **Shareable tours** — every tour gets a public `/tour/:id` link for read-only sharing
- **Authentication** — user accounts via Clerk
- **Dark mode**

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)
- A [Clerk](https://clerk.com) application (for auth)
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (for conversation persistence)

---

## Setup

### 1. Clone and configure environment

**Server** (`server/.env` or root `.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
CLERK_SECRET_KEY=sk_...
CLERK_PUBLISHABLE_KEY=pk_...
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/artslaw?retryWrites=true&w=majority
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

---

## Usage

1. Sign in with your Clerk account
2. Paste any exhibition URL and click **Begin the Tour**
3. ArtSlaw researches the exhibition via live web search and starts the conversation
4. Ask follow-up questions — about the artist, genre, related works, what to look for
5. Open **Discover** (search icon in the header) to browse recommended upcoming shows based on artists you've toured

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
│   │   │   └── TourPage.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts        # Proxies /api → localhost:3001
├── server/                   # Express + Anthropic SDK backend
│   └── src/
│       ├── db.ts             # MongoDB connection
│       ├── index.ts
│       └── routes/
│           ├── chat.ts       # POST /api/chat (streaming)
│           ├── conversations.ts
│           ├── discoveries.ts # GET /api/discoveries (CAL scraper)
│           └── title.ts
├── .env                      # Your secrets (not committed)
└── render.yaml               # Render deployment config
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic SDK (`@anthropic-ai/sdk`), `claude-haiku-4-5` |
| Search | `web_search_20260209` built-in server-side tool |
| Auth | Clerk |
| Database | MongoDB (Atlas) |
| Scraping | Cheerio (CAL exhibition data) |
| Markdown | `react-markdown` + `remark-gfm` |

---

## Production build

```bash
cd server && npm run build
cd ../client && npm run build
```

The client build outputs to `client/dist/`, served as static files by the Express server in production.
