# D1 pricing history implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move acknowledged page history to D1 without losing captures, changing archive URLs, or treating corrected interpretations as new observations.

**Architecture:** Keep active work and durable delivery retries in the page Durable Object. Archive terminal runs, captures, complete analysis revisions, answers, rubrics, and comparisons in D1. Keep artifact bytes in R2 and use immutable JSON payloads with narrow SQL indexes.

**Tech Stack:** TypeScript, Cloudflare D1, SQLite Durable Objects, R2, Workflows, Drizzle, Vitest, and real SQLite fixtures.

## Contract

- Preserve run IDs, capture times, artifact keys and hashes, complete evaluation JSON, failed runs, raw answers, and historical rubric definitions.
- Distinguish an observation from its analysis revisions. A complete analysis preserves facts, draft extraction, judgments, answers, and exact version metadata. A new analysis can reuse the archived facts without a new capture.
- Store a revision before selecting it. Select with an expected prior revision so concurrent corrections cannot silently overwrite one another.
- Bind comparisons to exact selected revisions. Reject a comparison between interpretations of the same capture.
- Publish only succeeded captures with a selected analysis. Failed capture artifacts stay owner-only.
- A correction keeps the original observation time and cannot replace a newer capture in the latest summary.
- Retry the same terminal envelope with the same identities. Reject changed payloads under immutable identities.
- Import legacy history in bounded, resumable chunks. Verify readiness before presenting D1 history as complete. Retain legacy source tables and R2 objects for recovery.
- No remote deployment, destructive cleanup, recapture, or model call is part of this implementation session.

## Ownership and files

- `packages/db/src/schema/pricing-history.ts` owns D1 history tables and constraints.
- `packages/db/src/history-types.ts` owns shared history records and serialization contracts.
- The history repository owns archive insertion, revision selection, page scoping, public eligibility, temporal ordering, and comparison dependencies.
- `apps/server/src/pricing/page-store.ts` owns active work, scheduler state, delivery retries, and bounded legacy export.
- `apps/server/src/pricing/service.ts` routes historical reads to D1 and live owner state to the coordinator.
- `packages/api/src/pricing-history-store.ts` reads weekly history directly from D1.
- `apps/server/src/pricing/publication.ts` preserves summary and owner ordering and permits a selected revision of the same capture.

## Throughput checkpoint

- Blocking first steps: baseline checks, two design candidates, and the schema and archive contract.
- Independent workstreams: design proposals and reviews are read-only. Root owns this plan and the decision trail.
- Shared mutable state: one migration owner edits coupled implementation files. No concurrent schema writers or commits.
- Smallest safe decomposition: verify schema and repository first, then import and coordinator integration, then read routing and final verification.

## Task 1: Establish the D1 history boundary

- [x] Add an additive migration and schema exports. Keep every previous migration unchanged.
- [x] Move shared DTO declarations out of server-only modules where D1 schema or API consumers need them.
- [x] Implement terminal archive insertion and independent analysis revisions behind one history API. Keep append separate from selection.
- [x] Test archive retry, conflicting payload rollback, page isolation, failed artifacts, and multiple interpretations of one capture.
- [x] Test that a correction leaves capture count and capture time unchanged.
- [x] Run `rtk proxy pnpm --filter @pricelog/db test` and the focused server history tests. Require all tests to pass.

The archive must contain one coherent terminal result. A successful result requires its capture, complete analysis, and public selection. A failed result can retain a capture or partial answers without becoming public.

## Task 2: Import legacy page history

- [x] Export terminal legacy runs in keyset chunks with a byte limit. Export related manifests, answers, evaluations, rubric definitions, and comparisons.
- [x] Assign deterministic initial revision IDs to imported captures. Preserve all original metadata and payload fields.
- [x] Checkpoint after D1 acknowledges a chunk. Verify counts and identities before recording readiness.
- [x] Test a failed import followed by retry, a commit before lost acknowledgment, and a page with more records than one chunk.
- [x] Keep old source records intact. Never fabricate capture history from a latest-summary row.
- [x] Document and test the operator or scheduled import path and its progress result.

## Task 3: Archive terminal work and keep retries safe

- [x] Freeze a terminal envelope before releasing the active run. Stage failures as well as successes.
- [x] Commit history and the latest summary in an idempotent D1 batch. Delete staged active-work rows only after acknowledgment.
- [x] Preserve independent alarm retry if a Workflow stops or D1 fails.
- [x] Preserve increasing run creation times after local history cleanup and clock rollback.
- [x] Make late Workflow calls resolve archived terminal state without recreating a completed run.
- [x] Test owner pagination across active, pending, and archived runs with ties and duplicate delivery.
- [x] Run server tests before changing the public history read path.

## Task 4: Read history and comparisons from D1

- [x] Route public version, source, screenshot, and history reads through the D1 repository with page-scoped visibility checks.
- [x] Replace corpus-wide DO history reads with indexed D1 weekly selection. Select each page and week before applying any display limit.
- [x] Pass exact revision dependencies through comparison generation and storage. Exclude stale cached comparisons after a correction.
- [x] Preserve public DTOs and run URLs. Update API fixtures for any internal revision identifiers.
- [x] Test correction of the current capture, correction of an older capture, and a comparison race with selection changes.
- [x] Remove retired permanent-history runtime paths while retaining the explicit legacy import reader.

## Task 5: Verify and document

- [x] Run `rtk proxy pnpm test`, `rtk proxy pnpm check-types`, and the repository lint command without format mutations.
- [x] Inspect generated migration SQL and replay the full migration chain over populated fixtures.
- [x] Exercise public history and archive routes against the running app under the project verification skill. Record missing environment prerequisites if a live check cannot run.
- [x] Update `docs/pricing-methodology.md` and operational instructions to match actual ownership and import behavior.
- [x] Review the final diff for data loss, authorization changes, retry races, and unsupported claims in the decision trail.
- [x] Report local verification separately from production deployment and backfill status.

## Verification result

The final suite passes 269 tests. Workspace types, the web production build, and oxlint pass. Changed-file formatting passes. The repository-wide formatter reports two unchanged historical Markdown files. See [the verification record](../../audits/2026-10-23-d1-history-verification.md).

The local operator import completed all 22 registry pages in five requests. D1 contains 95 terminal runs, 13 captures, and 12 analyses. The existing Botpress source URL returned identical bytes and SHA-256 before and after import. The browser profile and weekly empty state load through D1. No compatible adjacent-week pair exists locally, so weekly evidence-link UI verification remains unavailable. Production deployment and backfill were not run.

## Design alternatives

Direct D1 writes for every active event remove owner-read merging, but replace the current local run state machine with remote conditional transitions. Terminal archives preserve that state machine and reduce remote event writes. We choose terminal archives and accept one merge of live owner state with acknowledged D1 history.

The independent design review selected candidate B's terminal archive. It adopted candidate A's complete immutable analysis envelope and append-before-select API. Separate fact and judgment tables add no required capability to this storage migration, so those tables remain deferred. Both designs require exact revision comparison keys and verified bounded imports.

Keep full typed payloads and add indexes only for implemented queries. A new extractor, broader plan schema, and aggregate measurement redesign remain separate work.
