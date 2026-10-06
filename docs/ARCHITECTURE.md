# RetailLab — Architecture

> DATA → OBSERVATION → HYPOTHESIS → CALCULATION → EXPERIMENT → RESULT

RetailLab never presents an uncertain idea as an outcome. The architecture enforces that by
keeping four things physically separate: recorded data, deterministic calculation,
external research with sources, and hypotheses.

## 1. Layers

```
src/
  lib/                      PURE code. No I/O, no database, no process.env. Unit-tested.
    calc/                   Calculation engine (KPIs, scenarios, break-even, experiments, statistics)
    analytics/              Aggregation of facts into KPIs, anomalies, DTO types
    strategy/               Rule-based hypothesis engine + static strategy library
    providers/              Provider interfaces + demo / OpenStreetMap implementations + registry
    demo/                   Deterministic fictional dataset (AlpenMarkt GmbH)
    ai/                     Analyst tools and deterministic intent router
    period.ts format.ts validation.ts geo.ts colors.ts
  server/                   SERVER-ONLY code ("server-only" import). Database, auth, secrets.
    db.ts                   Prisma client (pg driver adapter)
    session.ts              requireOrg() — THE tenant boundary; role checks; assertStoreInOrg()
    queries.ts              Read models: Prisma rows → plain DTOs (numbers, ISO strings)
    action.ts               safeAction() wrapper + ActionState type for server actions
    rateLimit.ts            RateLimiter interface + in-memory implementation
    actions/*.ts            "use server" mutations, one file per feature
    research/               Research orchestration (providers → sources → findings)
    demo/seedDemo.ts        Demo organization seeding (also used by prisma/seed.ts)
  components/
    ui/                     Design system (Panel, Kpi, Tag, CalcBlock, Notice, Sources drawer…)
    charts/                 Recharts wrappers with text summaries and table views
    shell/                  Sidebar, top bar, command palette
    <feature>/              Feature components
  app/
    page.tsx                Landing: Explore Demo / Create Organization
    (auth)/login, register
    onboarding/             4-step setup wizard
    (app)/                  Authenticated shell; every route calls requireOrg()
    api/                    Route handlers (auth, analyst)
prisma/                     schema.prisma, migrations, seed.ts
tests/                      Vitest
```

Dependency rule: `app → components → lib`, `app → server → lib`. `lib` never imports
`server`. Client components never import `server` (except `import type`).

## 2. Database

See `prisma/schema.prisma`. Highlights:

- **Tenancy**: `Organization` ← `Membership` → `User`. Every business row is reachable from
  one organization, directly or through `Store`.
- **Facts are normalized**: `MonthlyRevenue` (one row per store-month), `Cost` (one row per
  store-month-type), `CategoryMetric`, `StoreMetric` (optional operational metrics such as
  hourly transactions). Nullable numeric columns mean *not provided*.
- **Research**: `ResearchSource` is first-class; `Competitor`, `LocationSignal` and
  `ResearchFinding` each reference the source they came from.
- **Scenarios store assumptions, not results**: `Scenario` + `ScenarioInput` (variant, key,
  value). Outputs are recomputed by the calc engine every time.
- **Reports store configuration**, content is rendered from live data.
- JSON columns are not used. Postgres `text[]` is used for short ordered lists
  (assumptions, risks, metrics, report sections).

## 3. Routes

| Route | Purpose |
|---|---|
| `/` | Landing — Explore Demo / Create Organization |
| `/login`, `/register`, `/onboarding` | Auth and setup wizard |
| `/overview` | Executive KPIs and charts, date range filter |
| `/stores`, `/stores/new`, `/stores/[id]`, `/stores/[id]/edit`, `/stores/[id]/data` | Store list, scorecard (tabs via `?tab=`), editing, monthly data entry |
| `/map` | MapLibre map of stores, competitors and signals |
| `/compare?stores=a,b,c,d` | Side-by-side comparison, facts vs hypotheses |
| `/analytics?tab=categories\|costs\|anomalies\|seasonality\|forecast\|patterns` | Analytics |
| `/strategies?tab=hypotheses\|library\|simulator\|break-even\|opportunity\|board`, `/strategies/new` | Strategy engine, library, simulators, opportunity board |
| `/experiments`, `/experiments/new`, `/experiments/[id]` | Experiment timeline and results |
| `/research?store=ID` | Research engine and sources |
| `/reports`, `/reports/[id]` | Report generator (print-ready) |
| `/settings` | Organization, privacy / AI controls, integrations |
| `/api/analyst` | Analyst endpoint (tool-based) |

Shared URL state: `?range=1m|3m|6m|12m|ytd|custom&from=YYYY-MM&to=YYYY-MM`
(`getPeriodContext` in `src/server/period.ts`).

## 4. Reusable components

`@/components/ui`: `Panel`, `PageHeader`, `Kpi`, `KpiGrid`, `Delta`, `Tag` (epistemic labels),
`Chip`, `CalcBlock`, `Formula`, `Notice`, `EmptyState`, `Missing`, `Skeleton`, `Field`,
`FormError`, `TabNav`, `Sparkline`, `RangeFilter`, `Cite`, `SourcesButton`.
`@/components/charts`: `TrendChart`, `BarsChart`, `ScatterPlot` (all with `summary` text and a
table view), `formatValue`.

## 5. Calculation engine

`src/lib/calc`. Pure TypeScript, no rounding, `null` for anything that cannot be computed.
An LLM is never asked to do arithmetic.

`calculateAverageBasket`, `calculateRevenuePerSqm`, `calculateRevenuePerEmployee`,
`calculateRevenuePerCustomer`, `calculateGrossProfit`, `calculateOperatingProfit`,
`calculateGrowthRate`, `calculateBreakEvenRevenue`, `calculateBreakEvenCustomers`,
`calculateScenarioRevenue`, `calculateOpeningHoursScenario`, `calculateTransactionUplift`,
`calculateInvestmentBreakEven`, `calculateRevenueOpportunity`, `calculateBasketChange`,
`calculateCostReduction`, `calculateExperimentLift`, `detectAnomalies`, `seasonalIndices`,
`forecastSeries`, `pearson`, `calculateDataQuality`.

## 6. Research providers

`src/lib/providers/types.ts`: `SearchProvider`, `PlacesProvider`, `DemographicsProvider`,
`MapsProvider`, `AIProvider`. `registry.ts` is the only place that picks an implementation.

| Capability | Shipped | Status |
|---|---|---|
| Places | `demo` (fictional, demo stores only), `overpass` (OpenStreetMap) | demo works; Overpass mapping unit-tested, live call unverified |
| Demographics | — | interface only → UI shows "No reliable source found" |
| Web search | — | interface only |
| LLM | — | interface only → analyst uses deterministic rules |
| Map tiles | OpenStreetMap raster | configurable via `NEXT_PUBLIC_MAP_TILE_URL` |

Rules: every fact carries a `SourceRef`; nothing found → empty result; demo data is flagged
`isDemo` end to end; providers never receive financial data.

## 7. AI tools

`src/lib/ai`: tool definitions (name, description, zod input schema, `execute(ctx, input)`)
that read through `src/server/queries.ts` and compute through `src/lib/calc`. The shipped
analyst is a deterministic intent router that selects tools — labelled as such in the UI.
An `AIProvider` may later choose tools and phrase answers; it receives only tool output that
passes the organization's privacy settings (`aiIncludeFinancials`, `aiIncludeStoreNames`,
`aiIncludeResearch`).

## 8. Demo data

`src/lib/demo/dataset.ts` generates 6 fictional stores × 24 months with a seeded PRNG.
`src/server/demo/seedDemo.ts` writes it and runs the real rule engine over it, so demo
hypotheses are produced by the same code path as for real data. All rows carry `isDemo`.

## 9. Validation

Zod schemas in `src/lib/validation.ts` (and next to each action). All mutations are server
actions wrapped in `safeAction()`: parse → authorize → write → `revalidatePath`. Client-side
validation is convenience only.

## 10. Security boundaries

- **Authentication**: Auth.js credentials provider, bcrypt hashes, JWT session cookie.
- **Tenant isolation**: `requireOrg()` derives the organization from the session +
  `Membership` table on every request. No action accepts an organization id from the
  client. Ids from the client are checked with `assertStoreInOrg` or an
  `organizationId`-scoped `where`.
- **Authorization**: roles OWNER / ANALYST / VIEWER; `requireWriter()` / `requireOwner()`.
- **Rate limiting**: `enforceRateLimit(scope, subject)`; in-memory by default, interface
  ready for Redis.
- **Secrets**: only read in `src/server` and `src/lib/providers/registry.ts`. Nothing secret
  uses the `NEXT_PUBLIC_` prefix.
- **Privacy**: internal financial data, public location research and AI context are three
  separate paths. Research providers receive coordinates and a radius — nothing else.
- Security headers in `next.config.ts`.
