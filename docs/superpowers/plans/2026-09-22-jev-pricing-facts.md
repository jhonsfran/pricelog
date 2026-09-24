# Jev pricing facts implementation plan

> Execute in the current task using subagent-driven-development for the independent benchmark task, followed by specification and code-quality review.

**Goal:** Make pricing facts and changes auditable using only Jev classification and deterministic code.

**Architecture:** Preserve source spans, select bounded candidates, persist offer facts, and derive page summaries. Use one approved model/rubric contract and a declared freshness window.

**Tech stack:** TypeScript, Cloudflare Workflows/Durable Objects/D1, Drizzle, Vitest, TanStack React.

- [x] Fix benchmark population and coverage in `packages/api/src/benchmark-store.ts`, `pricing-intelligence.ts`, `routers/directory.ts`, and benchmark presentation. Use `scannedAt >= now - 14 days`, current rubric, and `jev-1.13.0`. The denominator for a charging disclosure is `stated / eligiblePages`; unknown answers remain counted as uncertain. Test stale records, model mismatches, threshold boundaries, directory agreement, and the 40/100 coverage example.
- [x] Add source candidate and offer-fact types, collectors, and tests. Candidate selection uses keys such as `n0` and `offer0`; returned values must exist in the candidate map. Unknown names never become a manufactured plan identity. Test multiple plans, tables, bare currency markers, unsupported formats, crossed-out prices, direct usage, and uncertainty. Keep arithmetic in code.
- [x] Simplify the shared rubric and freeze its identity. Keep overlapping charging signals, literal disclosure choices, product category, and offer policies. Remove `primary_pricing_model`, `value_metric`, `expansion_path`, and `ai_cost_passthrough`. Test that an existing rubric identity cannot change its question contract.
- [x] Persist facts through scan evaluation and D1 projection, including complete evaluation provenance. Add the required generated database migration. Keep numeric-price displays as derived projections; expose source-linked offer facts on profiles.
- [x] Extend weekly observations and comparisons to facts. For a matched fact, compare a stable key built from offer, field, unit, currency, commitment, and conditions. Test 12-month to 3-month expiry, 100 to 50 allowance, changed base price, unchanged numeric facts, ambiguous offers, and model/rubric incompatibility.
- [x] Keep checked-in labeled fixtures for unit tests. Document that empirical production accuracy remains unmeasured until human-reviewed cases are evaluated. The optional live evaluation command was removed at the user’s request.
- [x] Update README and methodology to the implemented scope, source format, denominators, freshness rule, and versioning. Run relevant tests, type checks, lint, and build; inspect changed UI if a dev server is available.
- [x] Review specification compliance, then code quality, resolve findings, and summarize tested behavior and limits.

## Verification

- Server: 152 tests passed. API: 66 tests passed. Database: 4 tests passed.
- Server/API TypeScript checks and web TypeScript plus production client/SSR build passed.
- Targeted lint and `git diff --check` passed.
- Specification and code-quality reviews completed; identified numeric-token and equal-label/evidence gaps fixed with regression tests.
- Browser checked methodology and current benchmark coverage at the existing local dev server. Existing legacy captures are excluded until re-scanned under the new rubric.
- D1 migration generated and exercised in SQLite tests. No deployment or production migration was performed.
- Optional live Jev evaluation command removed at the user’s request. No live model requests or production accuracy measurements were made.
