# PlanT 🌱

Smart group travel planner with branching routes (Trunk & Sprouts) and AI fairy-tale booklets.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS 4** + shadcn/ui (emerald theme)
- **Prisma** + PostgreSQL
- **OpenAI** for storybook generation

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/plant?schema=public"
# Optional — server override only; users normally use in-app「AI 設定」
OPENAI_API_KEY=""
```

In the app, open **AI 設定** and choose a platform (**ChatGPT / Gemini / Claude**) plus your API Key. Keys stay in your browser only. Without a key, spot tips use **built-in recommendations** + Wikipedia photos.

### 3. Start PostgreSQL

**Option A — Homebrew (recommended on Mac)**

```bash
brew install postgresql@16
brew services start postgresql@16
createdb plant   # once
```

Set `DATABASE_URL` in `.env` to your macOS username (no password):

```env
DATABASE_URL="postgresql://YOUR_MAC_USERNAME@localhost:5432/plant?schema=public"
```

**Option B — Docker**

```bash
docker compose up -d
# DATABASE_URL="postgresql://plant:plant@localhost:5432/plant?schema=public"
```

### 4. Sync the schema

```bash
npm run db:push
```

### Troubleshooting: `Bootstrap failed: 5` (brew services)

If `brew services start postgresql@16` fails but you still need the DB, use the project helper (bypasses launchctl):

```bash
npm run db:start    # start Postgres + create `plant` DB if missing
npm run db:push
```

If `pg_isready` already prints **accepting connections**, Postgres is running — you can skip starting it and run `npm run db:push` directly.

To reset a stuck Homebrew service:

```bash
brew services stop postgresql@16
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/homebrew.mxcl.postgresql@16.plist 2>/dev/null || true
npm run db:start
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/trip` | Create trip (auto `seedCode`) |
| `GET` | `/api/trip/[seedCode]` | Fetch trip |
| `POST` | `/api/trip/[seedCode]/spot` | Add Trunk or Sprout spot |
| `PATCH` | `/api/spot/[spotId]/graft` | Graft Sprout → Trunk |
| `POST` | `/api/trip/[seedCode]/generate-booklet` | AI fairy-tale markdown |

## Concepts

- **Seed Code** — 6-character trip join code
- **Trunk Route** — shared main itinerary (`isTrunk: true`)
- **Sprouts** — personal branches (`isTrunk: false`)
- **Grafting** — cherry-pick a Sprout spot onto the Trunk
