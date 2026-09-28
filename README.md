# Pricelog

Pricelog is an open record of how AI products price. Every week it captures the pricing pages of AI products and checks each price against the captured page. It keeps every version, so anyone can see what a product charges, how it compares with its category, and what changed.

Records describe what a pricing page states. They do not measure pricing quality, buyer sentiment, willingness to pay, or the whole market. [The pricing methodology](docs/pricing-methodology.md) explains the acceptance rules and limits.

## What is on the site

| Route          | For              | What it shows                                                                                                                                                                      |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | Everyone         | The directory. A hero stacks the latest captures above a tape of verified prices. Below it, every page is one row with its category, price ladder, entry price and how it charges. |
| `/pages/:slug` | Everyone         | A page record: every published version (`?v=`), the capture's screenshot, headline numbers, verified changes since the previous capture, and the plans as cards.                   |
| `/benchmarks`  | Everyone         | Pricing practices by category: how products charge, how they monetize, and published price ranges. Each answer links to the pages behind it.                                       |
| `/changes`     | Everyone         | Verified pricing changes between the last two complete weeks, grouped by page, with the text before and after.                                                                     |
| `/methodology` | Everyone         | How captures are read and when a claim publishes.                                                                                                                                  |
| `/dashboard`   | Signed-in owners | Tracked pages. Each owner record adds collection details, claims held back from publishing, capture history with artifacts, and live scan progress.                                |

## How a capture becomes a record

1. **Capture.** Cloudflare Browser Run renders the page in Chromium. It dismisses cookie panels, clicks billing toggles, tabs and sliders, and records the visible text of each state. The HTML, a full-page screenshot and that page text go to R2. Pages behind a redirecting bot check, or under a strict Content-Security-Policy, are captured in a browser session instead.
2. **Draft.** An extraction model copies every price and feature line from the page text. Qwen3 30B answers first, and Llama 3.3 70B answers when Qwen fails. The model only copies; it proposes no labels.
3. **Ground.** Code keeps only quotes that appear word for word in the page text.
4. **Verify.** Jev (`typesafe/jev` on Workers AI, pinned to `jev-1.13.0`) asks one question per price and per feature row. It also classifies the product category and three monetization questions. A claim publishes at its threshold; anything else goes to the owner's review list.
5. **Derive.** Code computes the rest of the profile (free plan, contact sales, charging structure, price disclosure) and the monetization numbers (entry price, price ladder, annual discount, included unit price, overage markup), but only where the facts settle them.
6. **Publish.** The version is stored with its evaluation in the page's Durable Object, and the latest summary is delivered to D1 for the public directory.

Two captures are compared by diffing their snapshots. A change counts only when both archived pages show it; no model is involved. The same rule runs for the weekly report and for the changes shown on each version.

## Architecture

- **TanStack Start** serves the public site and the owner dashboard (`apps/web`).
- **Hono and oRPC** serve the public and authenticated API (`apps/server`, `packages/api`). `/rpc` is the oRPC endpoint, and `/api-reference` serves the OpenAPI reference.
- **Better Auth** owns user sessions (`packages/auth`). `PAGE_OPERATOR_EMAILS` controls sign-up, sign-in, and page-wide operator access.
- **Cloudflare D1** stores users, page ownership, public summaries, benchmark snapshots and owner dashboard projections (`packages/db`).
- **One SQLite Durable Object per normalized domain** (`PageStore`) holds scan runs, page versions, rubric answers, evaluations, comparisons and the next scan alarm.
- **Cloudflare Workflows** (`ScanWorkflow`) run each scan through `capture → archive → draft → verify → project → store → publish`.
- **Cloudflare R2** stores captured HTML, screenshots and page text.
- **Workers AI** runs the extraction models and Jev.
- **A daily cron** (03:00 UTC) appends benchmark snapshots per category and verifies weekly comparisons.
- **Alchemy** provisions D1, R2, the Durable Object, the Workflow, Browser Run, Workers AI and both Workers (`packages/infra`).

## Repository layout

```
apps/web          TanStack Start site: directory, page records, benchmarks, changes, dashboard
apps/server       Hono worker: API, artifact routes, PageStore, ScanWorkflow, capture and extraction
packages/api      oRPC routers, benchmark and weekly-report logic, shared API types
packages/db       Drizzle schema, D1 migrations, pricing catalogs and snapshot types
packages/auth     Better Auth configuration
packages/ui       Design tokens (Radix Colors, dark only) and shadcn components
packages/infra    Alchemy stack
docs              Methodology, audits, product notes
```

## Local setup

Install dependencies and generate the environment accessors:

```bash
pnpm install
pnpm run env:generate
```

Put values in the ignored `.env` files next to each `.env.schema`. Never commit secrets.

| Variable                   | Package          | Required | Purpose                                                                                  |
| -------------------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`       | `apps/server`    | Yes      | Session signing secret                                                                   |
| `BETTER_AUTH_URL`          | `apps/server`    | Yes      | Public URL of the API worker                                                             |
| `CORS_ORIGIN`              | `apps/server`    | Yes      | Comma-separated web origins, such as `http://localhost:4100,https://app.example.com`     |
| `PAGE_OPERATOR_EMAILS`     | `apps/server`    | No       | Comma-separated sign-in and sign-up allowlist; each account can open and scan every page |
| `PRICING_CAPTURE_CURRENCY` | `apps/server`    | No       | Currency the capture asks pages for (default `EUR`)                                      |
| `PRICING_CAPTURE_LANGUAGE` | `apps/server`    | No       | `Accept-Language` for captures (default `en-IE,en;q=0.9`)                                |
| `VITE_SERVER_URL`          | `apps/web`       | Locally  | API origin the site calls; Alchemy sets it on deploy                                     |
| `ALCHEMY_PASSWORD`         | `packages/infra` | Yes      | Password for the Alchemy stack's state                                                   |

Start the full Alchemy development stack:

```bash
pnpm run dev
```

The web app runs at `http://localhost:4100` and the API at `http://localhost:4000`. With a local API URL, the web dev server forwards `/rpc` and `/api` to port 4000. A remote API URL is called directly.

For frontend hot reload against a deployed development API, keep `http://localhost:4100` in that API's `CORS_ORIGIN` and run:

```bash
VITE_SERVER_URL=https://your-development-api.workers.dev pnpm run dev:web
```

Server changes still need an Alchemy deployment, because Cloudflare remote development does not support Workflow bindings.

## Database migrations

D1 and the Durable Object's SQLite use separate Drizzle migration streams:

```bash
pnpm run db:generate     # D1: packages/db/src/migrations
pnpm run db:generate:do  # Durable Object: apps/server/src/pricing/drizzle
```

Alchemy applies D1 migrations on deploy. Each PageStore applies its migrations when it starts.

## Tests and verification

```bash
pnpm run check        # oxlint and oxfmt
pnpm run check-types
pnpm test
pnpm run build
```

The tests cover:

- URL safety, alarm intervals and stalled-scan recovery;
- capture scripts, quote parsing (including European number formats) and grounding;
- Jev response validation, snapshot projection, monetization numbers and snapshot diffs;
- change confirmation, benchmark populations, weekly reports and ownership checks;
- the web's price display and directory filters.

Unit tests use scripted model answers. They check application rules, not model accuracy on real pages.

The pipeline carries two fingerprints:

- The rubric fingerprint identifies the Jev questions.
- `SNAPSHOT_IMPLEMENTATION_FINGERPRINT` covers the capture and extraction code.

A test fails when that code changes without a new fingerprint. A new fingerprint gives new scans a new pipeline ID, so they do not reuse stored evaluations.

## Deployment

Configure the Cloudflare provider once, then deploy through Alchemy:

```bash
cd packages/infra
pnpm exec alchemy profile edit
pnpm exec alchemy deploy --stage production
```

After the first deployment, add the deployed web origin to `CORS_ORIGIN` and deploy again. Keep `http://localhost:4100` in the list if a local web app must use the deployed API. Browser Run quick actions need the compatibility date `2026-03-24` or later.

## Behavior

- A page is one HTTPS URL and one normalized domain. The first signed-in user to add a domain owns it.
- The first scan starts at once and runs in the background. Every scan schedules the next one a week later.
- One scan can be active per page, and a second manual request returns the active one. A scan that stops reporting progress for 20 minutes is marked failed so a new one can start.
- A failed capture is retried three times, then waits for the next weekly scan.
- A version is public once its scan succeeded with an evaluation. Its archived text and screenshot are then public too. Captured HTML stays with the owner.
- Current comparisons use captures from the last 14 days, read with the current rubric and the accepted Jev model. Older versions stay visible as history.
- The weekly report pairs each page's latest capture in the two most recent complete UTC weeks (Monday to Monday). Pages read by different models or shown in different currencies are not compared.
- Owners see every claim that did not publish, with its reason, and can download each scan's artifacts.

## Current limits

- No domain ownership verification.
- No teams, roles, quotas or billing.
- No pause, delete or URL-change flow.
- Linked documents are not crawled, and no workload cost is estimated.
- A change to the rubric or model needs new evaluations; old records leave current comparisons.
- Chromium is the only browser engine.
