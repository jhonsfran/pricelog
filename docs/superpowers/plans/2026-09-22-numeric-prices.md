# Numeric prices implementation plan

> Use subagent-driven-development for the bounded extraction task and sequential specification/code reviews. The user's approval of the proposed numeric metrics authorizes implementation.

**Goal:** Publish exact, source-supported numeric prices and useful category comparisons.

**Architecture:** Deterministic numeric candidates plus Jev choice/noul validation. Versioned numeric results live in each DO's evaluation JSON; D1 contains latest results and category aggregates.

**Tech stack:** Existing TypeScript, Jev, Drizzle, Cloudflare DO/D1, React, and Vitest.

- [x] Define shared numeric offer/result types in `packages/db/src/numeric-prices.ts`. Implement candidate parsing and Jev validation in `apps/server/src/pricing/numeric-prices.ts`, with tests for exact amounts and rejected ambiguous contexts. Export `collectNumericPrices(source, decide)`.
- [x] Add optional `numericPrices` to `PublicEvaluation`, a nullable JSON field to D1 latest summaries, and numeric aggregate JSON to benchmark snapshots. Generate forward D1 migrations and update migration tests. Preserve existing DO version immutability and publication checks.
- [x] Call numeric collection after practice evaluation in `scan-workflow.ts`. Keep numeric provider failure visible as unavailable. Persist the result in the same evaluation before publication. Test storage/publication and failure handling.
- [x] Aggregate one baseline offer per product and compatible currency/commitment/charge unit in `packages/api/src/numeric-prices.ts`. Test monthly normalization, separate currencies, minimum sample size, missing data, and duplicates. Include source-linked page results through `directory.ts`.
- [x] Add numeric offer details and category comparisons to the existing UI. Replace deferred-price copy. Show billing term, amount period, allowance, overage, and source evidence. Update methodology.
- [x] Apply local migrations, rescan sample products through the owner UI, and verify exact displayed values against captures. Run relevant tests, type checks/build, lint and formatting. Record coverage and any unavailable results.
- [x] Run separate specification and quality reviews, fix issues, then make focused commits and report the result.

Validation: all 40 local sample scans completed; nine accepted numeric offers and five unavailable numeric evaluations. Exact evidence checked for all nine offers. Category medians remain withheld for insufficient comparable samples. See `docs/data/numeric-prices-scan-report.md`. Final automated checks: 220 tests, type checks, production build, lint, and two-stage review.
