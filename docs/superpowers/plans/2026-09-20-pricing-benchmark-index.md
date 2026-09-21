# Pricing Benchmark Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the aggregate the front door. Publish distributions across the indexed corpus, and put every per-page score next to its peer distribution, so a number arrives with the comparison class that gives it meaning.

**Why:** Defined in `docs/product/positioning.md`. A score with no peer group is a number without meaning, and the aggregate is the artifact people link to.

**Status:** Implemented. Deviations from the original plan are recorded under "Decisions" below.

**Architecture:** A scheduled aggregation reads every row of `page_public_summary` from D1, computes per-cohort distributions, and writes one `benchmark_snapshot` row per cohort per period. The public API serves the latest snapshot, falling back to a live computation only before the first scheduled run so a fresh deployment is never a blank page.

**Tech Stack:** TypeScript, Cloudflare Workers, Cron Triggers, D1, Drizzle ORM, oRPC, TanStack Start, React, Vitest.

---

### Task 1: Define cohorts and distribution math

**Files:**

- Create: `packages/api/src/benchmark.ts`
- Test: `packages/api/src/benchmark.test.ts`

- [x] Write failing tests for `cohortsForPage`, covering `all`, the page's `primary_market` choice, and `ai_native` when the `ai-native` tag is present.
- [x] Write failing tests for `summarizeDistribution`: count, median, p25, p75, and the percentile rank of a given value, including single-item and empty inputs.
- [x] Write failing tests for `shareOf`, which returns the fraction of a cohort holding a given choice value or positive signal tag.
- [x] Implement the three functions with no database or network access so they stay unit-testable.
- [x] Run `pnpm --filter @my-better-t-app/api test -- benchmark.test.ts` and verify it passes.

### Task 2: Persist benchmark snapshots in D1

**Files:**

- Modify: `packages/db/src/schema/pages.ts`
- Modify: `packages/db/src/schema/pages.test.ts`
- Create: `packages/db/src/migrations/<generated>/migration.sql`

- [x] Add a `benchmark_snapshot` table keyed by `(rubricId, cohort, computedAt)` holding `pageCount`, a typed JSON `scoreDistributions` map, a typed JSON `choiceShares` map, and a typed JSON `signalShares` map.
- [x] Add an index on `(rubricId, cohort, computedAt)` so the latest compatible snapshot per cohort is a single indexed read.
- [x] Add a check constraint requiring `pageCount >= 0`.
- [x] Generate the migration with `pnpm db:generate`.
- [x] Run the database tests and verify they pass.

### Task 3: Compute snapshots on a schedule

**Files:**

- Modify: `apps/server/src/index.ts`
- Create: `packages/api/src/benchmark-store.ts`
- Create: `packages/api/src/benchmark-store.test.ts`
- Modify: `packages/infra/alchemy.run.ts`

- [x] Write failing tests that feed a fixture set of public summaries and assert one snapshot row per non-empty cohort.
- [x] Suppress any cohort below a minimum of ten pages. A distribution over three pages is noise presented as authority.
- [x] Implement the job as a pure function over rows plus a thin D1 writer, so the job logic is tested without a Worker.
- [x] Add a daily Cron Trigger to the API Worker and wire it in Alchemy.
- [x] Run the server tests and verify they pass.

### Task 4: Serve benchmarks through the public API

**Files:**

- Modify: `packages/api/src/routers/directory.ts`
- Modify: `packages/api/src/routers/directory.test.ts`

- [x] Add `directory.benchmarks` returning the latest snapshot for a requested cohort, defaulting to `all`.
- [x] Extend `directory.getBySlug` to return, for each score, the page's percentile rank and the cohort median within its primary-market cohort.
- [x] Return `null` benchmark fields when the page's cohort is suppressed, rather than falling back to the `all` cohort and implying a comparison that was not made.
- [x] Run the API tests and type checks.

### Task 5: Build the index screen

**Files:**

- Create: `apps/web/src/routes/benchmarks.tsx`
- Create: `apps/web/src/components/distribution-chart.tsx`
- Modify: `apps/web/src/components/score-grid.tsx`
- Modify: `apps/web/src/components/header.tsx`
- Modify: `apps/web/src/index.css`

- [x] Build a cohort selector and render each score distribution as a horizontal band with median and quartile markers.
- [x] Render choice shares as ranked bars, ordered by share, with the raw count visible.
- [x] Lead the page with the AI cost findings: `ai_cost_passthrough` shares, and the share of usage-billed pages that publish a spend cap.
- [x] In `ScoreGrid`, render the peer median as a marker on the existing track and the percentile beneath the number. Suppress both when the API returns null.
- [x] Reuse the existing `--band`, `--fill`, and stagger tokens. Do not introduce a second motion vocabulary.
- [x] Run the web type check and the repository formatter.

### Task 6: Publish the methodology

**Files:**

- Create: `apps/web/src/routes/methodology.tsx`
- Modify: `apps/web/src/components/header.tsx`

- [x] Render every question, its criteria, and its thresholds directly from `@my-better-t-app/api/pricing-intelligence`, so the published methodology cannot differ from the evaluated prompt.
- [x] State the disclosure limitation plainly: Pricelog measures what a pricing page states, not what a product does.
- [x] State the confidence thresholds (`0.75` for choices, `0.80` for tags) and the suppression rule for small cohorts.
- [x] Link the methodology from the index screen and from every page profile.

### Task 7: Verify the complete change

**Files:**

- Modify only files that fail verification because of this feature.

- [x] Run `pnpm test`.
- [x] Run `pnpm check-types`.
- [x] Run `pnpm check`.
- [x] Inspect `git diff --check` and the generated migration.
- [x] Confirm a suppressed cohort renders as absent rather than as a comparison against the wrong peer group.

---

## Decisions

- **Cohort definition (resolved).** The two uses were separated rather than traded off.
  - _Aggregate cohorts are overlapping_, built from the `market_*` signals plus `is_ai_native`. A page serving developer tools and data analytics appears in both distributions, and each claim stays well formed: "among N pages that materially serve developer tools."
  - _A page's own peer group is exactly one cohort_, chosen by `peerCohortForPage`: its own `primary_market`, else `ai_native`, else `all` — restricted to cohorts the page actually belongs to and that are large enough to publish. The interface always names the cohort, which is what dissolves the ambiguity. A percentile that says which peer group it is against is unambiguous no matter how many groups exist.
- **Histogram instead of quartiles alone.** The snapshot stores 20 buckets over 0-100. This is what makes an exact percentile rank readable from a stored snapshot without re-reading the corpus, and it lets the index draw distribution shape rather than three markers.
- **Choice denominators.** `ChoiceShare.answered` counts pages with a confident answer, not cohort size. A percentage whose denominator is the wrong population is worse than no percentage.
- **Requested cohort is never substituted.** `selectCohort` returns null when the requested cohort is not publishable rather than falling back to a larger one.

## Still open

- **Minimum cohort size.** Ten is still a guess (`COHORT_MINIMUM` in `packages/api/src/benchmark.ts`). Set it by how noisy the p25/p75 band looks on real data.
- **Period granularity.** The cron runs daily (`crons: ["0 3 * * *"]`). Confirm daily is the right grain before the aggregate time series is long enough to matter.
- **Live fallback cost.** Before the first cron fires, `loadBenchmarks` reads up to 2,000 summaries per request. Fine at current scale; revisit if the index grows before the schedule is reliable.
