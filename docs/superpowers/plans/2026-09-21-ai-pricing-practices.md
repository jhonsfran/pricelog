# AI pricing practices implementation plan

> The subsequent [AI product category plan](2026-09-21-ai-product-categories.md) upgrades the rubric to v5 and records the 40-product sample. The v4 details below describe the earlier implementation stage.

> Execute in this task using subagent-driven-development. Keep page history in each page Durable Object. Remove obsolete scoring compatibility. Do not deploy or seed company data.

**Goal:** Replace public quality rankings with category-based pricing-practice benchmarks and an evidence-backed weekly change record.

**Architecture:** A shared v4 Jev catalog defines categories, independent charging signals, and policy choices. Existing snapshots gain signal coverage. Successful scans store evaluations and model versions beside captured versions in the page DO. D1 retains only registry, latest projections, and global aggregates. A scheduled comparison of completed UTC weeks uses narrow Jev choices and source-block selections, then stores literal evidence. Public routes serve the benchmark and safe plain-text archived sources.

**Tech Stack:** TypeScript, Cloudflare Workers/Workflows, D1, Drizzle, Jev, oRPC, React, TanStack Router, existing shadcn controls, Vitest.

## Tasks

- [x] Rubric and interface: introduce v4 questions, remove legacy score types, active score evaluation, and public rankings, publish exact criteria and limitations, use existing components and styles.
- [x] Aggregation: create category cohorts from accepted `product_category` choices, retain all category counts, show signal coverage, and exclude legacy rubric data.
- [x] Observation history: add append-only successful observations and weekly comparison storage with idempotent keys. Preserve actual provider model version and captured source identity.
- [x] Change verification: select latest observation per page per completed UTC week; require compatible rubric/model; reject unchanged-source changes; verify semantic changes with Jev and literal before/after evidence; store inconclusive results separately.
- [x] Public integration: expose weekly comparison coverage and evidence, safe source links, category examples, and empty states.
- [x] Validation: meaningful fixtures for uncertainty, missing weeks, duplicate captures, incompatible versions, policy changes, evidence IDs, and cohort denominators; run tests, types, lint, formatting, build, and browser inspection.
- [x] Review: review specification coverage before code-quality review; fix findings, update product docs, and report operational requirements.

## Shared contract

`PRICING_INTELLIGENCE_RUBRIC_ID` becomes `pricing-intelligence-v4`. The shared catalog exports `PRACTICE_CHOICE_KEYS`, `CHARGING_SIGNAL_KEYS`, and `PRODUCT_CATEGORY_OPTIONS`. Category choices use `coding_assistants`, `customer_support_agents`, `workflow_agent_builders`, `model_apis`, `other`, `not_disclosed`.

Existing benchmark result fields remain. `signalShares` adds `{ stated, notEstablished, uncertain }` per signal. `available` includes small categories. `selected` can exist below ten observations so the UI can show counts and examples without headline percentages. `examples` includes current source pages from the selected cohort.

The `directory.weeklyChanges` endpoint accepts `{ cohort }` and returns `{ periodStart, periodEnd, previousPeriodStart, pairedPages, verifiedPages, reviewedPages, uncertainPages, newPages, missingPages, items }`. Each item includes page ID, slug, name, run IDs, capture dates, question key, label, kind (`commercial` or `disclosure`), before/after labels, literal evidence, and safe source URLs. `periodEnd` is exclusive. No paired pages means no rate, not a zero rate.

## Verification commands

Use `rtk pnpm test`, `rtk pnpm check-types`, `rtk pnpm exec oxlint`, `rtk pnpm exec oxfmt --check`, and `rtk git diff --check`. Generate D1 migrations with the installed Drizzle CLI. Do not apply migrations remotely.

## Completion and operation

Implemented and reviewed on 2026-09-21. The v4 catalog, category aggregates, observation history, source evidence, weekly comparisons, and public interface are complete. No company data was seeded and no deployment was performed.

Before deployment, apply `packages/db/src/migrations/20260921145749_lean_polaris/migration.sql` through the existing D1 migration process. Existing pages require new successful v4 scans before entering current aggregates. Weekly reports require compatible captures in two adjacent completed UTC weeks. The daily benchmark job processes eligible comparisons. Failed pairs remain retryable without blocking other pages.

Blank, oversized, or incomplete sources do not publish observations. Provider responses must include an exact Jev version. Both evidence requests have conservative byte limits; oversized comparisons remain uncertain. These are operational safeguards, not measured model-accuracy claims.

Validation: 131 tests passed across database, API, and server. Type checks, production frontend build, lint, and diff whitespace checks passed. Migration tests preserve historical rubric IDs and enforce comparison references and uniqueness. Browser checks cover populated, small, empty, and unavailable states, literal weekly evidence, and mobile width. Populated checks use browser-only fixtures; the local API connection has a CORS failure. Live Jev accuracy and production integration have not been measured. The full repository format check has one existing failure in `docs/superpowers/plans/2026-09-20-quality-score-question-tooltip.md`; modified files are checked separately.

## Storage correction and legacy removal

The owner clarified that historical page state must stay in each page DO and backward scoring compatibility is unnecessary. This section supersedes the earlier D1 history design and compatibility notes.

- One canonical pricing URL per normalized domain maps to one `PageStore` DO.
- The DO owns scan runs, immutable successful version records, typed raw Jev answers, exact provider model versions, evaluated terms, and weekly comparisons.
- R2 holds large HTML, Markdown, and screenshot objects. Version records inside the DO hold their keys and content hashes.
- D1 holds auth, the page directory, current public and owner projections, and global benchmark snapshots. It has no observation-history or comparison tables.
- Weekly queries enumerate the complete active registry in batches of 20 and read each page DO. Failures do not produce a silently incomplete denominator.
- A scan freezes its successful DO version before publishing D1 projections. A failed completion cannot enter the public index. The DO retains a pending publication before completion. D1 projection failures leave the canonical version intact; the workflow and DO alarm retry publication without a new capture. Late delivery cannot overwrite newer page metadata or a newer active scan.
- Old score types, calculations, ranking helpers, UI components, inactive questions, and score columns are removed. Incremental migrations remove old storage without rewriting migration history already applied to local databases.

Apply all pending D1 migrations through `20260921201233_marvelous_retro_girl`, not only the original migration listed above. DO migrations run at object initialization through `20260921155102_handy_plazm`. No remote deployment was requested.

Initial observed runtime failure: `cloudflare.com` run `55fae2f8-8a87-4fd9-a0bf-62343f46a94c` failed with `WebSocket connection failed.` Current Alchemy logs also report Cloudflare OAuth refresh failures. These require a live retry after the local runtime can access its existing Cloudflare account. No fixture test establishes that the remote browser or Jev call succeeds.

D1 owner projections use a strictly increasing run creation time assigned inside the page DO transaction. This prevents stale running/success/failure writes from replacing newer status. Completion delivery has real SQLite tests for retries, object reconstruction, and concurrent newer scans.

Final automated checks: 128 tests, type checks, frontend production build, lint, and changed-file formatting pass. The existing Cloudflare OAuth credentials were refreshed and the local Alchemy stack was restarted to apply all pending D1 migrations. Live Linear scan `a3b0a572-f16a-4410-932e-e6737f44438a` succeeded with HTTP 200 capture, rubric `pricing-intelligence-v4`, model `jev-1.13.0`, and 46 persisted answers. The DO stores its version and evaluation; D1 contains the same run in its latest summary and successful owner state. Both stores schedule the next scan seven days after completion. The dashboard shows the completed scan and new practice results.
