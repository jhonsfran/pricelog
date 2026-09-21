# Benchmark Quality and shadcn Adoption Design

## Goal

Make the benchmark index correct across rubric versions and corpus sizes, then align the changed interactive UI with the repository's shadcn component system without changing the product-specific visual language.

## Scope

This change fixes all findings from the thermo-nuclear review:

- benchmark snapshots must contain one comparable rubric version;
- scheduled snapshots must read the complete active corpus;
- scheduled errors must use a logger that works outside an HTTP request;
- peer median markers must remain visible;
- the global web stylesheet must be decomposed before it grows further;
- published scoring thresholds must come from the evaluator's canonical contract.

It also replaces raw interactive controls changed by this branch with shadcn components. Product-specific charts, meters, rows, and page layouts remain custom.

## Architecture

### Versioned benchmark corpus

The current rubric identity becomes part of the benchmark contract. The snapshot reader filters public summaries to the current rubric before aggregation. Each stored snapshot records its rubric ID, and latest-snapshot reads select one complete computation for that rubric. Old summaries remain public, but they do not enter a distribution whose dimensions or questions differ.

The API reports both the number of compatible benchmark pages and the total number of indexed pages. This makes migration progress explicit instead of presenting a partial compatible corpus as the full directory.

### Complete scheduled computation

Live fallback computation stays bounded because it runs on a request. Scheduled computation uses cursor pagination and reads all compatible active summaries. The two paths use separate functions so a fallback safety limit cannot silently constrain persisted snapshots.

Each scheduled computation builds all cohort rows in memory and writes them with one multi-row insert. The existing unique key keeps retries idempotent for a supplied computation timestamp.

### Shared scoring contract

Choice confidence, signal probability, rubric identity, and benchmark cohort minimum live in importable shared modules. The evaluator, methodology page, benchmark job, and API use the same values. The methodology must not restate operational constants.

### Background logging

HTTP request failures continue to use the request-scoped logger. The scheduled benchmark handler uses the module-level logger because no Hono middleware context exists during a cron event.

### shadcn boundary

The web application uses shadcn for standard interaction and feedback primitives:

- `Button` for actions and link-like actions;
- `Input` for text entry;
- `Field`, `FieldGroup`, and `FieldError` for authentication forms;
- `Skeleton` for loading placeholders;
- `ToggleGroup` for the cohort selector.

Custom components remain appropriate for benchmark histograms, share bars, score meters, status displays, directory rows, and page layouts. These components express product data and are not generic controls.

### Style decomposition

`apps/web/src/index.css` becomes a small entry point that imports focused stylesheets. Styles are grouped by ownership:

- foundation and shared layout;
- directory and owner pages;
- public profile and intelligence components;
- authentication;
- benchmark and methodology pages.

Shared shadcn components keep their own source styles. Route styles can position components but do not recreate their control behavior.

## Data flow

1. A scan writes a public summary with its rubric ID.
2. The daily job paginates all active summaries for the current rubric.
3. Pure aggregation code builds overlapping cohorts and distributions.
4. The job stores versioned snapshot rows.
5. Public API reads the latest complete computation for the current rubric.
6. Page profiles select one publishable peer cohort from the same rubric snapshot.
7. The web UI renders the distribution and names its cohort and compatible sample size.

## Error handling

- A scheduled read or write failure rejects the cron task and logs the original error through the global logger.
- A request before the first snapshot receives a bounded live result and an explicit `live` marker.
- A missing compatible cohort returns `null`; the API never substitutes another cohort.
- A directory with old-rubric pages reports migration counts instead of treating unasked questions as negative answers.

## Verification

Tests must cover:

- exclusion of summaries from other rubric versions;
- scheduled pagination beyond the fallback limit;
- latest snapshot selection by rubric ID;
- shared methodology thresholds;
- visible peer marker CSS that does not inherit the fill transform.

Repository type checks, unit tests, lint, formatting checks, production web build, and `git diff --check` must pass. A final browser check must cover authentication fields, cohort selection, loading skeletons, and peer score markers.

## Commit structure

1. Design specification.
2. Benchmark integrity and scheduled-job fixes.
3. Shared scoring contract and methodology consistency.
4. shadcn adoption and stylesheet decomposition.
5. Remaining product feature files, tests, documentation, and infrastructure if they are not already included by the preceding commits.
