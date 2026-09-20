# Pricing page monitor MVP implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public pricing-page directory and owner-only weekly scan system defined in `docs/superpowers/specs/2026-09-20-pricing-page-monitor-design.md`.

**Architecture:** D1 stores Better Auth data, page ownership, directory data, and small current-state projections. One SQLite Durable Object per normalized domain owns run history, version metadata, the Jev rubric, deduplication, and its alarm. A Cloudflare Workflow captures one Chromium snapshot, stores artifacts in R2, evaluates Markdown with `typesafe/jev`, persists results to the Durable Object, and publishes the latest summary to D1.

**Tech Stack:** TypeScript, TanStack Start, React, Hono, oRPC, Better Auth, Drizzle ORM, Cloudflare D1, Durable Objects, Workflows, Browser Run, R2, Workers AI, Alchemy, Vitest, evlog.

---

## File structure

Create or modify these focused units:

- `packages/db/src/schema/pages.ts`: D1 page and projection tables.
- `packages/db/src/schema/index.ts`: D1 schema exports.
- `packages/db/src/relations.ts`: page relations.
- `packages/db/src/migrations/*`: generated D1 migration.
- `apps/server/drizzle-do.config.ts`: Durable Object migration generator.
- `apps/server/src/pricing/types.ts`: shared run, score, and RPC DTOs.
- `apps/server/src/pricing/url.ts`: URL normalization and public-address checks.
- `apps/server/src/pricing/score.ts`: Markdown budgeting and score normalization.
- `apps/server/src/pricing/rubric.ts`: `pricing-quality-v1` Jev questions.
- `apps/server/src/pricing/do-schema.ts`: Durable Object Drizzle schema.
- `apps/server/src/pricing/drizzle/*`: generated Durable Object migrations.
- `apps/server/src/pricing/page-store.ts`: Durable Object state and alarm logic.
- `apps/server/src/pricing/scan-workflow.ts`: durable capture, R2, Jev, and projection steps.
- `apps/server/src/pricing/service.ts`: adapter from oRPC context to the Durable Object binding.
- `packages/api/src/context.ts`: runtime-independent page monitor service contract.
- `packages/api/src/routers/directory.ts`: public directory procedures.
- `packages/api/src/routers/pages.ts`: owner page procedures.
- `packages/api/src/routers/index.ts`: router composition.
- `apps/server/src/artifacts.ts`: authenticated R2 artifact streaming route.
- `apps/server/src/context.ts`: inject the page monitor service.
- `apps/server/src/index.ts`: export runtime classes and mount the artifact route.
- `packages/infra/alchemy.run.ts`: R2, Browser Run, Workers AI, Durable Object, and Workflow bindings.
- `apps/web/src/routes/index.tsx`: public directory.
- `apps/web/src/routes/pages/$slug.tsx`: public page profile.
- `apps/web/src/routes/_auth/dashboard.tsx`: owner page list and create form.
- `apps/web/src/routes/_auth/dashboard/pages/$pageId.tsx`: owner run history and manual trigger.
- `apps/web/src/components/score-grid.tsx`: reusable five-dimension score display.
- `apps/web/src/components/run-status.tsx`: run state display.
- `apps/web/src/components/header.tsx`: directory and dashboard navigation.

## Task 1: Test runner and central D1 schema

**Files:**

- Modify: `package.json`
- Modify: `packages/db/package.json`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/src/schema/pages.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/relations.ts`
- Create: `packages/db/src/schema/pages.test.ts`
- Generate: `packages/db/src/migrations/*`

- [ ] Add root and package test scripts. Add `vitest` as a root dev dependency so `pnpm test` runs `turbo run test` and each package can expose a focused test command.
- [ ] Write `pages.test.ts` first. Assert table names, unique domain and slug indexes, owner relation metadata, and score JSON round-tripping.
- [ ] Run `pnpm --filter @my-better-t-app/db test`; expect failure because `pages.ts` does not exist.
- [ ] Define `page`, `pagePublicSummary`, and `pageOwnerState` with SQLite checks and indexes from the design. Use `integer(..., { mode: "timestamp_ms" })` for all dates and `text(..., { mode: "json" }).$type<...>()` for score JSON.
- [ ] Export the tables and add relations from page to owner, public summary, and owner state.
- [ ] Run the package test; expect all schema tests to pass.
- [ ] Run `pnpm run db:generate`; inspect the generated SQL for all three tables, foreign keys, checks, and indexes.
- [ ] Commit with `feat(db): add pricing page directory schema`.

## Task 2: Pure domain rules

**Files:**

- Create: `apps/server/src/pricing/types.ts`
- Create: `apps/server/src/pricing/url.ts`
- Create: `apps/server/src/pricing/url.test.ts`
- Create: `apps/server/src/pricing/score.ts`
- Create: `apps/server/src/pricing/score.test.ts`
- Create: `apps/server/src/pricing/rubric.ts`
- Modify: `apps/server/package.json`

- [ ] Write URL tests for HTTPS enforcement, credential rejection, nonstandard ports, lowercase hosts, trailing-dot removal, one leading `www.` removal, subdomain preservation, fragment removal, IPv4 private ranges, IPv6 loopback/link-local/unique-local ranges, localhost suffixes, and DNS results containing a non-public address.
- [ ] Run the URL tests; expect module-not-found failure.
- [ ] Implement `normalizePricingUrl(input, resolveHost)` returning `{ canonicalUrl, normalizedDomain }`. Keep the path and query. Resolve both A and AAAA records through the injected resolver.
- [ ] Write score tests for `budgetMarkdown`, `normalizeJevScore`, and `calculateOverallScore`. The long-input test must retain 16,000 leading and 8,000 trailing characters with one fixed marker.
- [ ] Implement the score helpers and the five-question `PRICING_QUALITY_V1` object. Each question uses `type: "score"` and the five approved criteria.
- [ ] Run the focused tests; expect all cases to pass.
- [ ] Commit with `feat(server): add pricing scan domain rules`.

## Task 3: Durable Object database and migrations

**Files:**

- Create: `apps/server/drizzle-do.config.ts`
- Create: `apps/server/src/pricing/do-schema.ts`
- Create: `apps/server/src/pricing/do-schema.test.ts`
- Generate: `apps/server/src/pricing/drizzle/*`
- Modify: `apps/server/package.json`

- [ ] Configure Drizzle Kit with `dialect: "sqlite"`, `driver: "durable-sqlite"`, schema `./src/pricing/do-schema.ts`, and output `./src/pricing/drizzle`.
- [ ] Write schema tests for the singleton config and scheduler rows, unique Workflow ID, unique version run ID, composite question and answer keys, and run-history index.
- [ ] Run the test; expect failure because the schema is absent.
- [ ] Define `pageConfig`, `schedulerState`, `run`, `pageVersion`, `questionSet`, `question`, and `answer` exactly as specified.
- [ ] Add `db:generate:do` to `apps/server/package.json` and root `package.json`.
- [ ] Generate migrations and inspect `migrations.js` plus the SQL snapshot.
- [ ] Run schema tests and type checks.
- [ ] Commit with `feat(server): add page durable object schema`.

## Task 4: Page Durable Object behavior

**Files:**

- Create: `apps/server/src/pricing/page-store.ts`
- Create: `apps/server/src/pricing/page-store.test.ts`
- Modify: `apps/server/src/pricing/types.ts`

- [ ] Write tests with fake storage and Workflow bindings for initialization, rubric seeding, initial-run creation, manual deduplication, scheduled triggers, run history pagination, artifact lookup, successful completion, failed completion, and alarm times.
- [ ] Verify the tests fail because `PageStore` does not exist.
- [ ] Implement `PageStore extends DurableObject<Env>`. In `ctx.blockConcurrencyWhile`, create the Drizzle client, apply generated migrations, and seed `pricing-quality-v1` idempotently.
- [ ] Implement RPC methods `initializeAndStart`, `triggerManual`, `listRuns`, `getRun`, `getArtifact`, `markRunning`, `persistVersion`, `getActiveRubric`, `persistAnswers`, `completeSuccess`, and `completeFailure`.
- [ ] In `startRun`, commit the active-run decision before calling `env.SCAN_WORKFLOW.create({ id: runId, params })`. On create failure, store `workflow_start_failed` and set tomorrow's alarm.
- [ ] Implement `alarm()` by calling the same start method with trigger `scheduled`.
- [ ] Run PageStore tests and type checks.
- [ ] Commit with `feat(server): add per-page durable object`.

## Task 5: Scan Workflow and Alchemy resources

**Files:**

- Create: `apps/server/src/pricing/scan-workflow.ts`
- Create: `apps/server/src/pricing/scan-workflow.test.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/server/cloudflare-env.d.ts`

- [ ] Write Workflow tests around an injected capture, R2, AI, D1, and PageStore adapter. Assert the write order: capture and R2, Durable Object version, Jev answers, D1 projections, Durable Object success.
- [ ] Add failure tests for invalid final URL, capture failure, archive failure, evaluation failure, projection failure, old-result projection rejection, and terminal one-day scheduling.
- [ ] Implement `ScanWorkflow extends WorkflowEntrypoint<Env, ScanWorkflowParams>`. Use `step.do` with bounded exponential retries for capture, evaluation, persistence, and projection.
- [ ] Call `env.BROWSER.quickAction("snapshot", { url, formats: ["content", "markdown", "screenshot"], screenshotOptions: { fullPage: true }, gotoOptions: { waitUntil: "networkidle2", timeout: 120000 } })`.
- [ ] Decode the screenshot, hash all payloads, write deterministic R2 keys, and return only the artifact manifest from the capture step.
- [ ] Call `env.AI.run("typesafe/jev", { state: budgetMarkdown(markdown), questions: rubric.questions })`, validate the response, and persist scores and probabilities.
- [ ] Update `pagePublicSummary` only when `excluded.scannedAt > pagePublicSummary.scannedAt`. Update `pageOwnerState` for running and terminal states.
- [ ] Export `PageStore` and `ScanWorkflow` from `apps/server/src/index.ts` without changing the existing evlog service name.
- [ ] Provision a private R2 bucket and add `PAGE_STORE`, `SCAN_WORKFLOW`, `ARTIFACTS`, `BROWSER`, and `AI` bindings in Alchemy. Set a Browser Run compatible date at or after `2026-03-24`.
- [ ] Run Workflow tests, server type checks, and infrastructure type checks.
- [ ] Commit with `feat(server): add durable pricing scan workflow`.

## Task 6: Public and owner API

**Files:**

- Modify: `packages/api/src/context.ts`
- Create: `packages/api/src/routers/directory.ts`
- Create: `packages/api/src/routers/pages.ts`
- Create: `packages/api/src/routers/pages.test.ts`
- Modify: `packages/api/src/routers/index.ts`
- Create: `apps/server/src/pricing/service.ts`
- Create: `apps/server/src/artifacts.ts`
- Modify: `apps/server/src/context.ts`
- Modify: `apps/server/src/index.ts`

- [ ] Define a runtime-independent `PageMonitorService` in API context with `initializeAndStart`, `listRuns`, `getRun`, `triggerManual`, and `getArtifact` methods.
- [ ] Write API tests with fake context for directory redaction, owner list state, idempotent create, duplicate claim conflict, non-owner not-found behavior, manual deduplication, and run details.
- [ ] Implement `directory.list` with cursor pagination and search over display name and normalized domain. Implement `directory.getBySlug` with active-only filtering.
- [ ] Implement protected `pages.listOwned`, `pages.create`, `pages.getOwned`, `runs.trigger`, and `runs.get`. Every protected page lookup must filter by both page ID and session user ID.
- [ ] Implement the server adapter that resolves `env.PAGE_STORE.getByName(normalizedDomain)` and maps Durable Object RPC values to API DTOs.
- [ ] Implement `GET /api/pages/:pageId/runs/:runId/artifacts/:kind`. Recheck the Better Auth session and D1 owner before reading R2. Serve HTML with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- [ ] Run API tests, package type checks, and server type checks.
- [ ] Commit with `feat(api): add pricing directory and owner procedures`.

## Task 7: Public directory UI

**Files:**

- Create: `apps/web/src/components/score-grid.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Create: `apps/web/src/routes/pages/$slug.tsx`
- Modify: `apps/web/src/components/header.tsx`
- Modify: `apps/web/src/routes/__root.tsx`

- [ ] Build `ScoreGrid` with semantic labels, numeric 0 through 100 values, and accessible progress bars.
- [ ] Replace the starter home page with a dark, restrained directory inspired by the attached `skills.sh` reference. Include the product name, purpose, search input, result count, score, domain, and last scan date.
- [ ] Add the public detail route with page metadata, overall score, all five dimensions, confidence, rubric version, and scan timestamp.
- [ ] Update the header labels and document title to `Pricelog`.
- [ ] Verify empty, loading, error, pending, and populated states with component tests or route-level rendering tests.
- [ ] Run web type checks and build.
- [ ] Commit with `feat(web): add public pricing directory`.

## Task 8: Owner dashboard UI

**Files:**

- Create: `apps/web/src/components/run-status.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Create: `apps/web/src/routes/_auth/dashboard/pages/$pageId.tsx`

- [ ] Build `RunStatus` for queued, running, succeeded, and failed states with text, not color alone.
- [ ] Replace the starter dashboard with an owner page list, URL create form, current status, latest score, next scan time, and page link.
- [ ] Add the owner detail route with manual scan action, current stage, reverse chronological runs, errors, score details, and authenticated artifact links.
- [ ] On manual trigger success, invalidate owner page and run queries. If the API returns the active run ID, show that run rather than adding a duplicate row.
- [ ] Add input and server-error states to the create form.
- [ ] Run web type checks and build.
- [ ] Commit with `feat(web): add pricing page owner dashboard`.

## Task 9: Verification and operating notes

**Files:**

- Create: `apps/server/src/pricing/authorization.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-20-pricing-page-monitor-design.md` only if implementation facts differ

- [ ] Add cross-owner tests that cover page detail, run detail, manual trigger, and every artifact kind. Assert `NOT_FOUND` for each unauthorized request.
- [ ] Add idempotency tests that repeat Workflow persistence and projection calls with the same run ID.
- [ ] Add a smoke test for sign-up, page creation, queued state, and duplicate manual trigger returning the same run ID. Use Browser Run, Workers AI, and R2 fakes so CI does not need cloud credentials.
- [ ] Document local setup, migration commands, Alchemy resource bindings, test commands, deploy command, and current MVP limits in `README.md`.
- [ ] Run `pnpm run check`, `pnpm run check-types`, `pnpm test`, and `pnpm run build`.
- [ ] Inspect `git diff --check` and verify no generated secrets or `.env` files are staged.
- [ ] Commit with `test: verify pricing page monitor MVP`.

## Completion evidence

The MVP is complete only when all of these are true:

- D1 and Durable Object migration files exist and apply in tests.
- Alchemy type-checks with D1, R2, Browser Run, Workers AI, Durable Object, and Workflow bindings.
- Public procedures expose only active directory data and the latest successful scores.
- Cross-owner API and artifact tests return not found.
- One active run is enforced and a duplicate manual trigger returns its ID.
- Success schedules seven days later and terminal failure schedules one day later.
- Chromium capture stores HTML, Markdown, and a full-page PNG under deterministic R2 keys.
- Jev receives the fixed five-question rubric and the budgeted Markdown.
- The public and owner web routes build and show all required states.
- Formatting, type checks, tests, and production builds pass.
