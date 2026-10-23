# D1 history verification

The migration is implemented on `codex/d1-pricing-history`. Production deployment and backfill were not run.

## Automated checks

- `pnpm test` passes 269 tests. The baseline passed 254 tests.
- `pnpm check-types` passes for the workspace and builds the web client and server.
- `pnpm exec oxlint` passes.
- Changed-file `oxfmt --check` and `git diff --check` pass.
- Repository-wide `oxfmt --check` reports two unchanged files, `docs/audits/2026-09-22-index-methodology-audit.md` and `docs/superpowers/plans/2026-09-20-quality-score-question-tooltip.md`.

The tests cover immutable archive retries, conflicting writes, page isolation, failed artifacts, complete analysis retention, CAS selection, summary ordering, stale comparisons, bounded imports, lost acknowledgements, source retention, pending publication, owner access during D1 failure, and pagination with tied timestamps.

An independent final review found no additional actionable issue. The review required removal of automatic backfill from the benchmark cron. The operator endpoint owns backfill. The cron waits for readiness.

## Local runtime

The run started and stopped its own Alchemy development instance. API port 4000 returned `OK`. Web port 4100 returned HTTP 200. The browser title and `PRICELOG` link matched the app. Ports were free after cleanup.

A disposable local operator authenticated through the existing auth API. An unauthenticated migration request returned HTTP 401. Five authenticated requests through `POST /api/operations/pricing-history/migrate` imported the entire registry without errors.

| D1 record                          | Count |
| ---------------------------------- | ----: |
| Registry pages                     |    22 |
| Ready imports with matching counts |    22 |
| Terminal runs                      |    95 |
| Captures                           |    13 |
| Analyses                           |    12 |
| Answer sets                        |    12 |
| Page-scoped rubric documents       |    22 |
| Comparisons                        |     0 |

`PRAGMA foreign_key_check` returned no rows. The operator import did not create a scan or call a browser or model.

## Public history

The browser opened Botpress through its directory link. Its profile retained the September 28, 2026 capture, four plans, screenshot, and archived-text link.

The existing source path is `/api/public/pages/689668e9-2bab-4e05-b812-453b61709b66/runs/45eeac2d-504c-4aa3-be25-b64b92364c19/source`. Before and after import, it returned HTTP 200 and 6,923 identical bytes. Its SHA-256 is `fe318817a68a602896dedebdfecc98f7694d5a9b84f63879ce2688e9cdf7a5b2`.

Weekly changes loaded its dated empty state. Selecting Coding assistants changed the cohort query and retained the report. The local corpus has no compatible capture pair in the two completed weeks. Before-and-after evidence links were not exercised through the UI. SQLite tests verify weekly selection and revision-specific comparisons.

Snapshots, screenshots, source digests, migration responses, database counts, and action records remain at `/private/tmp/pricelog-verification/pricelog-d1-history-20261023/`.

## Decisions

Model the Domain led to separate capture and analysis identities. Make Operations Idempotent led to immutable payload guards and acknowledgement before workspace cleanup. Sequence Verifiable Units led to separate repository, import, read-path, and runtime checks.

See [the decision trail](./2026-10-23-d1-history-decisions.tsv) and [the rollout runbook](../d1-history-runbook.md).
