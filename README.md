# RetailLab

Understand stores. Test strategies. Measure growth.

Analytics, scenario and experiment platform for physical retail.
DATA → OBSERVATION → HYPOTHESIS → CALCULATION → EXPERIMENT → RESULT

Stack: Next.js 15 (App Router) · TypeScript strict · Tailwind · PostgreSQL · Prisma · Auth.js ·
Recharts · Framer Motion · MapLibre GL + OpenStreetMap.

## Quick start

Requirements: Node 20+, Docker (or any PostgreSQL 14+).

```bash
cp .env.example .env          # then set AUTH_SECRET (npx auth secret  /  openssl rand -base64 32)
npm install
npm run db:up                 # starts Postgres in Docker (skip if you have your own; adjust DATABASE_URL)
npm run setup                 # prisma generate + migrate deploy + seed the fictional demo
npm run dev                   # http://localhost:3000
```

On the start page choose **Explore Demo** (fictional "AlpenMarkt GmbH", 6 stores, 24 months) or
**Create Organization** (register → 4-step setup wizard). Demo login: `demo@retaillab.example` / `demo`.

Windows: the commands work in PowerShell; use `copy .env.example .env`.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest (calculation engine, analytics, router, privacy filter, providers …) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:seed` | Recreate the demo organization |
| `npm run db:reset` | Drop and recreate the whole database |

## What is real and what is not

- **Calculations** are deterministic TypeScript in `src/lib/calc`, covered by tests. No LLM does arithmetic.
- **Strategy engine and analyst are rule-based.** No language model is connected. `AIProvider`
  in `src/lib/providers/types.ts` is the interface to add one; the UI says so.
- **Places / competitors**: the demo uses a clearly labelled fictional provider that only answers
  for demo stores. `PLACES_PROVIDER=overpass` enables OpenStreetMap; its response mapping is
  unit-tested, but the live call was not exercised in the build environment — verify once.
- **Demographics and web search**: interfaces only. The UI shows "No reliable source found".
- **Map tiles**: OpenStreetMap raster tiles (override with `NEXT_PUBLIC_MAP_TILE_URL`). Respect
  the OSM tile usage policy; use a tile provider of your own for production.
- **Rate limiting** is in-memory (single process). Swap the `RateLimiter` implementation for
  Redis when running several instances.
- **Team**: members are added by email of an already registered user; there is no invitation mail.

Architecture, data model, routes and security boundaries: `docs/ARCHITECTURE.md`.
