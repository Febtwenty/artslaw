# ArtGuide

An AI-powered art tour guide. Paste a link to any museum or gallery exhibition and chat with ArtGuide — your knowledgeable, friendly gallery companion.

ArtGuide uses Claude (`claude-sonnet-4-5`) with live web search to research exhibitions in real time, then explains the artist, the works, the movement, and related artists in an accessible, engaging way.

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

---

## Setup

### 1. Clone and configure environment

```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Install dependencies

```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
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

Then open [http://localhost:5173](http://localhost:5173) in your browser.

The Vite dev server proxies `/api/*` requests to the Express backend automatically — no CORS issues during development.

---

## Usage

1. Paste any exhibition URL into the input field (e.g. a MoMA, Tate, or gallery page)
2. Click **Begin the Tour** — ArtGuide will research the exhibition using live web search
3. Ask follow-up questions in the chat: about the artist, the genre, related works, what to look for, and more

---

## Project structure

```
artslaw/
├── client/                  # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── ExhibitionLinkInput.tsx
│   │   │   ├── InputBar.tsx
│   │   │   └── MessageBubble.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts       # Proxies /api → localhost:3001
├── server/                  # Express + Anthropic SDK backend
│   └── src/
│       ├── index.ts
│       └── routes/chat.ts   # POST /api/chat
├── .env                     # Your secrets (not committed)
├── .env.example             # Template
└── README.md
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic SDK (`@anthropic-ai/sdk`), `claude-sonnet-4-5` |
| Search | `web_search_20260209` built-in server-side tool |
| Markdown | `react-markdown` + `remark-gfm` |

---

## Production build

```bash
# Build the server
cd server && npm run build

# Build the client
cd ../client && npm run build
```

The client build outputs to `client/dist/`. You can serve it with any static host and point API requests to the running Express server.
