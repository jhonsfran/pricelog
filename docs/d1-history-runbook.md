# Move saved pricing history to D1

Use this procedure after the D1 history schema and Worker code are deployed. The operator import is required for existing pages. The benchmark cron does not import history.

## Apply the schema before the Worker change

Apply `packages/db/src/migrations/20261023201048_d1_pricing_history/migration.sql` through the normal D1 migration process. Keep all earlier migrations unchanged. The migration adds history tables and `page_public_summary.analysis_id`.

Deploy the Worker code after the schema exists. Do not delete DO history or R2 objects. The import needs both as recovery sources.

## Import the registry

1. Sign in with an existing account listed in `PAGE_OPERATOR_EMAILS`.
2. Send an authenticated `POST /api/operations/pricing-history/migrate` request.
3. If `nextCursor` is present, send the next request with `?cursor=<nextCursor>`.
4. When `nextCursor` is null, start another sweep without a cursor if `remainingPages` is greater than zero.
5. Stop when `remainingPages` is zero and no result contains an error.

Each request visits at most five pages. The registry includes pending pages. Each page imports at most ten source records and 1 MiB per call. A cursor lets later pages progress when an earlier page has an error. A later sweep retries the failed page.

The route requires a session cookie. It returns HTTP 401 without a session and HTTP 403 for an account outside the operator list. It creates no scan, calls no browser or model, and does not change an existing DO alarm or scan schedule.

The importer stores its source identity, expected record count, checkpoint, and acknowledged count in durable storage. It advances the checkpoint only after D1 acknowledges the write. An interrupted request can repeat the last record. Identical content is a no-op. Changed content under an immutable identity causes an error and rolls back that batch.

Readiness requires the expected count, the acknowledged count, an unchanged source count, and no source keys after the final checkpoint. Source records include rubric documents, terminal runs with their captures and answers, and comparisons. A succeeded capture without an evaluation stays private until an analysis is added and selected.

Pending legacy publication is delivered before its record is acknowledged. Copying a capture alone does not acknowledge summary delivery. The importer keeps the original DO history rows. It clears a pending delivery record only after D1 acknowledgement.

## Check the result

Check these D1 queries with the normal read-only database tool:

```sql
SELECT p.id, p.state, i.ready, i.expected_count, i.imported_count
FROM page p
LEFT JOIN history_import i ON i.page_id = p.id
ORDER BY p.id;

SELECT page_id, status, count(*) AS runs
FROM history_run
GROUP BY page_id, status;

PRAGMA foreign_key_check;
```

Every registry page must have `ready = 1`. The expected and imported counts must match. `foreign_key_check` must return no rows.

Open an existing public page. Check its version order and a saved source URL. Compare the source bytes and SHA-256 digest with the pre-import result. The run ID, capture time, R2 key, and source digest must match.

Open an owner run that failed after capture. Its artifacts must remain private and accessible to its owner. Public source and screenshot routes require a succeeded run with a selected analysis.

Until a page is ready, its public history and artifact routes return HTTP 503. The global weekly route waits for all active pages. Owner workspace runs and artifacts remain readable during import and while D1 delivery fails. The benchmark cron skips work while active page imports are incomplete.

## Add an analysis of saved bytes

Use `createPricingHistoryRepository(db)` from `packages/api/src/pricing-history-repository.ts` in trusted Worker code. The repository has no public HTTP write route for analyses.

1. Read the page-scoped analysis with `getAnalysis(pageId, analysisId)` to obtain its original draft, snapshot, audit, review, coverage, pipeline, model, and answers.
2. Read the saved capture through its existing owner artifact reference if the new interpretation needs the source bytes.
3. Build a complete `AnalysisEnvelope` with a new analysis ID, explicit idempotency key, unchanged run ID, exact rubric ID, model version, and analysis creation time.
4. Call `appendAnalysis(pageId, envelope, rubricDocument)`.
5. Inspect the new analysis before selection.
6. Call `selectAnalysis(pageId, runId, newAnalysisId, expectedPriorAnalysisId)`.

Use `null` as the expected prior ID for a succeeded capture that has no selected analysis. The repository rejects a failed capture, another page's capture, or a stale expected ID. A new rubric definition requires a new rubric identity within that page.

Appending does not change the public result. Selection updates the public result without creating a scan or changing its schedule. A correction to the latest capture can refresh its summary. A correction to an older capture cannot replace a newer capture's summary.

Comparisons keep both analysis IDs. If selection changes during comparison work, the old comparison remains stored but is not served for the new pair.

## Recover from a failed delivery or import

For new scans, keep the DO terminal archive record. The alarm retries D1 delivery independently of the Workflow. A successful D1 acknowledgement permits cleanup of that scan's workspace rows. Replayed terminal calls read the archived status after cleanup.

For import errors, keep the DO rows and rerun the operator sweep. Do not mark a page ready by hand. Do not remove immutable guards to force an import.

If one source record exceeds 1 MiB, the import stops before it advances that record's checkpoint. Preserve the source and inspect that record before changing the export format or bound. The importer never truncates a payload.

If an immutable identity conflicts, compare the saved payload with the source. Use a new analysis or rubric identity for a revised interpretation. Do not overwrite an acknowledged historical payload.
