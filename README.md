# Pricelog

Pricelog is a public directory and private monitor for software pricing pages. It captures each page with Chromium and archives rendered Markdown, HTML, and a full-page screenshot. Jev classifies facts stated on the captured pricing page. Code copies numeric values, computes sample statistics, and compares captures.

The records describe published terms. They do not measure pricing quality, buyer sentiment, willingness to pay, or the whole market. See [the pricing methodology](docs/pricing-methodology.md) for the acceptance rules and limits.

## Architecture

- **TanStack Start** serves the public directory and owner dashboard.
- **Hono and oRPC** provide the public and authenticated API.
- **Better Auth** owns user sessions. A page has one owner in this MVP.
- **Cloudflare D1** stores users, page ownership, public summaries, and small owner dashboard projections.
- **One SQLite Durable Object per normalized domain** owns scan history, page-version metadata, rubric questions, deduplication, and the next alarm.
- **Cloudflare Workflows** coordinate capture, archive, evaluation, projection, and terminal state.
- **Cloudflare Browser Run** captures one Chromium snapshot.
- **Cloudflare R2** stores private artifacts.
- **Workers AI `typesafe/jev`** answers bounded Choice and Noul questions. The accepted model is pinned to `jev-1.13.0`. No other model extracts or verifies facts.
- **Alchemy** provisions D1, Durable Objects, Workflows, R2, Browser Run, Workers AI, and both Workers.

## Local setup

Install dependencies and generate environment accessors from the existing schemas:

```bash
pnpm install
pnpm run env:generate
```

Required server values are `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `CORS_ORIGIN`. `CORS_ORIGIN` accepts a comma-separated allowlist, such as `http://localhost:4100,https://app.example.com`. Keep real values in ignored environment files. Do not commit secrets.

Start the full Alchemy development stack:

```bash
pnpm run dev
```

The default web origin is `http://localhost:4100`. The API origin is `http://localhost:4000`.

For frontend hot reload against a deployed development API, keep `http://localhost:4100` in the API `CORS_ORIGIN` allowlist and run:

```bash
VITE_SERVER_URL=https://your-development-api.workers.dev pnpm run dev:web
```

This keeps Vite and its hot module replacement local. Server changes still require an Alchemy deployment because Cloudflare remote development does not support Workflow bindings.

## Database migrations

D1 and Durable Object SQLite use separate Drizzle migration streams:

```bash
pnpm run db:generate
pnpm run db:generate:do
```

- D1 migrations: `packages/db/src/migrations`
- Durable Object migrations: `apps/server/src/pricing/drizzle`

Alchemy applies the D1 migrations during deployment. Each PageStore applies its Durable Object migrations during initialization.

## Tests and verification

```bash
pnpm run check
pnpm run check-types
pnpm test
pnpm run build
```

Tests cover schemas, URL safety, alarm intervals, artifact keys, Jev response validation, source literals, offer attribution, numeric comparisons, benchmark population rules, and ownership checks.

Unit tests use scripted Jev answers to verify application rules. They do not measure model accuracy on real pricing pages.

## Deployment

Configure the Cloudflare provider once, then deploy through Alchemy:

```bash
cd packages/infra
pnpm exec alchemy profile edit
pnpm exec alchemy deploy --stage production
```

After the first deployment, add the exact deployed web origin to `CORS_ORIGIN` and deploy again. Keep `http://localhost:4100` in the list if a local web app must use the deployed API. Browser Run quick actions require the configured compatibility date of `2026-03-24` or later.

## MVP behavior

- One HTTPS URL and one normalized domain per page.
- The first authenticated user to add a domain becomes its owner.
- The initial scan starts asynchronously.
- One scan can be active for a page. A duplicate manual request returns that active run.
- A successful scan schedules the next alarm seven days later.
- A failed scan waits for the next weekly scan, after three capture attempts.
- A later manual success resets the seven-day schedule.
- The public directory lists active published captures. Current comparisons and lists opened from benchmark bars require the current rubric, exact accepted model, and a capture from the last 14 days. Future timestamps are excluded.
- Public profiles retain the latest successful summary and show when it is excluded from current comparisons.
- Profiles show accepted facts and policies by offer, unresolved counts, and literal evidence linked to the archived Markdown source.
- Weekly reports compare compatible captures from adjacent completed UTC weeks. Numeric changes require the same named offer and compatible terms, followed by independent Jev evidence checks.
- Owners can view run history and download capture artifacts. Published records expose their archived Markdown source.

## Current limits

- No domain ownership verification.
- No teams, roles, quotas, or billing integration.
- No pause, delete, or URL-change flow.
- No general content-diff view between versions.
- The rubric has an immutable content fingerprint. A rubric or model change requires new evaluation; old records do not enter current comparisons.
- Unsupported number formats and ambiguous offer matches remain unresolved.
- No linked-document crawling or workload-cost estimate.
- Chromium is the only browser engine.
