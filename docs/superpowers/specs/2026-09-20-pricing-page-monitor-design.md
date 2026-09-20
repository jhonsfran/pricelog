# Pricing page monitor MVP design

Date: 2026-09-20

## Goal

Build a public directory of pricing pages with private owner-only scan history. The system scans each page after creation, then seven days after each successful scan. A page owner can start a manual scan. Each scan stores rendered HTML, cleaned Markdown, and a full-page screenshot, then uses TypeSafe AI Jev to score the page against a fixed quality rubric.

This document defines the MVP. It does not implement it.

## Confirmed product rules

- The directory and each page's latest successful score are public.
- Run history, errors, screenshots, HTML, Markdown, and manual controls are owner-only.
- One normalized domain has one monitored pricing URL.
- One user owns a page. The MVP has no teams, collaborators, or ownership transfer.
- The first authenticated user to add a domain becomes its owner. The MVP does not verify DNS or website ownership.
- A user can own any number of pages. Metering and quotas are outside this work.
- Page creation accepts one HTTPS URL. The first scan derives the display name and description from page metadata.
- The first scan starts immediately and runs asynchronously.
- A page can have only one queued or running scan. A second trigger returns the active run.
- A successful scan sets the next alarm to its completion time plus seven days.
- A successful manual scan also resets the seven-day alarm.
- A terminal scan failure sets the next alarm to its completion time plus one day.
- The MVP archives and evaluates each version independently. It does not compare versions.
- Every page uses the same system-defined Jev rubric.
- The MVP uses Chromium only. Kitesurf is outside this version.
- Owners can create pages, view pages and runs, open artifacts, and start manual scans. Pause, edit, and delete come later.

## Existing stack

The repository already has these parts:

- TanStack Start and React for the web application
- Hono for the Cloudflare Worker API
- oRPC for typed API procedures
- Better Auth with email and password authentication
- D1 and Drizzle for central relational data
- Alchemy for Cloudflare provisioning
- evlog for structured application logs
- Turborepo and pnpm for the monorepo

The implementation must extend these patterns. It must not replace the async Hono Worker with a different runtime model.

## Architecture

```text
Public and owner web
        |
        v
Hono + oRPC API Worker
   |        |        |
   v        v        v
  D1    Page DO   Scan Workflow
            ^       |   |   |
            |       v   v   v
            |    Browser R2  Workers AI
            |    Chromium    typesafe/jev
            +---------- results
```

### Central D1

D1 owns global identity and discovery data:

- Better Auth users, sessions, accounts, and verification records
- Page ownership
- The unique normalized domain claim
- Public page metadata
- The latest successful public score projection
- The current owner-only scan projection used by the dashboard list

D1 does not contain private run history or artifact keys.

### Page Durable Object

One Durable Object instance exists for each normalized domain. The API resolves it with `getByName(normalizedDomain)`.

The object owns:

- Run deduplication
- Private run history
- Version metadata and R2 artifact references
- Versioned Jev question sets and answers
- The active run ID
- The next scan time
- The Durable Object alarm

The Durable Object SQLite database is the authority for private scan state. The D1 public score is a projection.

### Scan Workflow

One Cloudflare Workflow instance executes one scan. Its instance ID equals the run ID. This gives every scan one identifier across the Durable Object, Workflow, R2, logs, and D1 projection.

The Workflow owns retries and step progress. It does not own long-term history because Cloudflare retains completed Workflow state for a limited period.

### Browser Run

The Workflow uses one Chromium `snapshot` Quick Action with these formats:

- Rendered HTML
- Markdown
- Full-page PNG screenshot

One request keeps all artifacts on the same page load. The Markdown is the Jev input. Raw HTML is never sent to Jev.

### R2

R2 stores the large immutable artifacts in a private bucket:

```text
pages/{pageId}/runs/{runId}/page.html
pages/{pageId}/runs/{runId}/page.png
pages/{pageId}/runs/{runId}/content.md
```

The web client has no direct R2 binding. An authenticated Worker route checks D1 ownership and streams the requested object.

### Workers AI and Jev

The Workflow calls the Workers AI model `typesafe/jev`. It sends the cleaned Markdown and all fixed score questions in one request. Jev returns a numeric score, confidence, legend, and probability distribution for each question.

## Domain and URL rules

Page creation applies these rules before it claims a domain:

1. Parse the URL with the platform URL parser.
2. Require `https:`.
3. Reject embedded credentials.
4. Permit only the default HTTPS port.
5. Lowercase the hostname and remove its trailing dot.
6. Remove one leading `www.` label.
7. Keep every other subdomain. `pricing.example.com` and `example.com` are separate domains.
8. Reject localhost names and local-only suffixes.
9. Reject literal private, loopback, link-local, multicast, documentation, and reserved IPv4 and IPv6 addresses.
10. Resolve A and AAAA records before capture and reject a hostname if any answer is non-public.
11. Remove the URL fragment. Keep the path and query because the user selected one exact pricing URL.
12. Revalidate the Browser Run final URL before accepting the capture.

D1 enforces a unique constraint on `normalized_domain`. The first successful insert owns the claim.

The browser runs in Cloudflare's managed Browser Run service, not inside the application network. URL checks still reduce abuse and reject inputs that cannot be public pricing pages.

## Central D1 schema

The existing Better Auth tables remain unchanged.

### `page`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | text | Primary key |
| `owner_user_id` | text | Not null, foreign key to `user.id` |
| `normalized_domain` | text | Not null, unique |
| `canonical_url` | text | Not null |
| `slug` | text | Not null, unique |
| `display_name` | text | Nullable until first successful scan |
| `description` | text | Nullable, derived from page metadata |
| `state` | text | `pending` or `active` |
| `created_at` | integer | Unix milliseconds |
| `updated_at` | integer | Unix milliseconds |

Indexes:

- `(owner_user_id, created_at)` for the owner dashboard
- `(state, created_at)` for directory pagination

`pending` pages do not appear in the public directory. The first successful scan changes the state to `active`. A later failed scan does not remove the last successful public result.

### `page_public_summary`

| Column | Type | Rules |
| --- | --- | --- |
| `page_id` | text | Primary key, foreign key to `page.id` |
| `run_id` | text | Not null, unique |
| `rubric_id` | text | Not null |
| `model` | text | Not null |
| `overall_score` | real | Not null, range 0 through 100 |
| `scores_json` | text | Not null, validated JSON |
| `browser_engine` | text | `chromium` |
| `scanned_at` | integer | Unix milliseconds |
| `updated_at` | integer | Unix milliseconds |

Indexes:

- `(overall_score, page_id)` for ranking
- `(scanned_at, page_id)` for recent scans

The projection update uses `scanned_at` as a monotonic guard. An older Workflow cannot replace a newer public result.

### `page_owner_state`

| Column | Type | Rules |
| --- | --- | --- |
| `page_id` | text | Primary key, foreign key to `page.id` |
| `active_run_id` | text | Nullable |
| `last_run_id` | text | Nullable |
| `last_run_status` | text | Nullable, `queued`, `running`, `succeeded`, or `failed` |
| `next_scan_at` | integer | Nullable Unix milliseconds |
| `updated_at` | integer | Unix milliseconds |

This is a small owner-dashboard projection, not run history. Public procedures never select or return it. The Page Durable Object remains authoritative and the Workflow repairs this projection after retries.

## Durable Object SQLite schema

Each Page Durable Object has the same schema, but the data belongs to one domain only.

### `page_config`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | integer | Primary key, always `1` |
| `page_id` | text | Not null, unique |
| `normalized_domain` | text | Not null |
| `canonical_url` | text | Not null |
| `created_at` | integer | Unix milliseconds |
| `updated_at` | integer | Unix milliseconds |

### `scheduler_state`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | integer | Primary key, always `1` |
| `active_run_id` | text | Nullable |
| `next_scan_at` | integer | Nullable Unix milliseconds |
| `updated_at` | integer | Unix milliseconds |

### `run`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | text | Primary key |
| `trigger` | text | `initial`, `scheduled`, or `manual` |
| `status` | text | `queued`, `running`, `succeeded`, or `failed` |
| `stage` | text | `queued`, `capture`, `persist`, `evaluate`, `publish`, or `complete` |
| `workflow_instance_id` | text | Not null, unique |
| `requested_by_user_id` | text | Nullable for scheduled runs |
| `browser_engine` | text | Nullable until capture, then `chromium` |
| `error_code` | text | Nullable |
| `error_message` | text | Nullable, safe for the owner UI |
| `created_at` | integer | Unix milliseconds |
| `started_at` | integer | Nullable Unix milliseconds |
| `completed_at` | integer | Nullable Unix milliseconds |

Indexes:

- `(created_at, id)` for reverse chronological history
- `(status, created_at)` for active-run checks

### `page_version`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | text | Primary key |
| `run_id` | text | Not null, unique, foreign key to `run.id` |
| `captured_at` | integer | Unix milliseconds |
| `http_status` | integer | Origin response status |
| `final_url` | text | Not null |
| `title` | text | Nullable |
| `browser_engine` | text | `chromium` |
| `html_key` | text | Not null |
| `screenshot_key` | text | Not null |
| `content_key` | text | Not null |
| `html_sha256` | text | Not null |
| `screenshot_sha256` | text | Not null |
| `content_sha256` | text | Not null |
| `html_bytes` | integer | Not null |
| `screenshot_bytes` | integer | Not null |
| `content_bytes` | integer | Not null |

### `question_set`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | text | Primary key, for example `pricing-quality-v1` |
| `model` | text | Not null, initially `typesafe/jev` |
| `version` | integer | Not null |
| `active` | integer | Boolean |
| `created_at` | integer | Unix milliseconds |

### `question`

| Column | Type | Rules |
| --- | --- | --- |
| `question_set_id` | text | Foreign key to `question_set.id` |
| `key` | text | Stable question key |
| `type` | text | `score` in the MVP |
| `instructions` | text | Not null |
| `criteria_json` | text | Five ordered anchors |
| `minimum` | integer | `0` |
| `maximum` | integer | `4` |
| `position` | integer | Display order |

Primary key: `(question_set_id, key)`.

### `answer`

| Column | Type | Rules |
| --- | --- | --- |
| `version_id` | text | Foreign key to `page_version.id` |
| `question_set_id` | text | Not null |
| `question_key` | text | Not null |
| `score` | real | Jev score from 0 through 4 |
| `confidence` | real | Range 0 through 1 |
| `legend_json` | text | Jev response legend |
| `probabilities_json` | text | Jev probability map |
| `created_at` | integer | Unix milliseconds |

Primary key: `(version_id, question_set_id, question_key)`.

## Drizzle migrations

The two SQLite systems use separate Drizzle schemas and histories.

### D1 migrations

Keep the existing D1 Drizzle package. Add the `page`, `page_public_summary`, and `page_owner_state` tables to its schema. Alchemy applies generated D1 migrations during deployment.

### Durable Object migrations

Create a separate Drizzle configuration with:

```ts
{
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
}
```

`drizzle-kit generate` writes SQL files and a `migrations.js` bundle. The `PageStore` constructor opens `drizzle-orm/durable-sqlite` and applies that bundle before it serves RPC calls.

Schema migrations create tables. Object initialization idempotently inserts the active rubric. A later rubric change inserts a new question set instead of changing historical questions.

## Jev rubric `pricing-quality-v1`

All five questions use Jev's `score` type with five ordered criteria. Jev returns values from 0 through 4.

### `pricing_transparency`

Instruction: "How transparent is the page about what the buyer will pay?"

0. No concrete price is visible.
1. The page gives only a starting price or asks the buyer to contact sales, with no usable cost basis.
2. Some prices are visible, but currency, billing period, unit, or conditions are missing or inconsistent.
3. Most standard prices, units, currencies, and billing periods are explicit, with minor gaps.
4. All standard prices and cost units are explicit, including billing periods and material pricing conditions.

### `pricing_clarity`

Instruction: "How easy is it to understand the pricing structure and terms?"

0. The pricing structure cannot be understood.
1. Major labels or terms are missing, conflicting, or undefined.
2. The structure is present but requires substantial interpretation.
3. The structure and most terms are clear, with minor ambiguity.
4. The structure, terminology, and calculation basis are direct and unambiguous.

### `pricing_completeness`

Instruction: "How complete is the commercial information needed to evaluate a purchase?"

0. Essential commercial information is absent.
1. The page gives headline prices but little else.
2. The page gives core prices plus some inclusions, limits, or billing details.
3. The page covers most inclusions, limits, exclusions, billing rules, and extra costs.
4. The page covers plans, inclusions, exclusions, limits, overages, billing rules, and eligibility conditions.

### `plan_comparability`

Instruction: "How well can a buyer compare the available plans or purchase options?"

0. The buyer cannot compare options.
1. Options appear separately with no consistent basis for comparison.
2. Some differences are stated, but important comparisons remain unclear.
3. Major features, limits, and prices use a mostly consistent comparison structure.
4. The page makes plan differences, trade-offs, and intended customer fit explicit.

### `purchase_actionability`

Instruction: "How clear is the next step to buy, try, or contact sales?"

0. The page gives no purchase path.
1. A generic contact path exists, but the next step is unclear.
2. A call to action exists, but prerequisites or expected outcomes are unclear.
3. Most plans have a clear next action and enough context to proceed.
4. Every purchase path has a clear action and states relevant trial, contract, eligibility, or sales-contact expectations.

For each dimension:

```text
normalized score = Jev score / 4 * 100
```

The public overall score is the unweighted mean of the five normalized scores. Confidence does not change the score. The system stores and displays confidence separately.

The Workflow stores the full Markdown in R2. If the Markdown exceeds 24,000 Unicode characters, the Jev input keeps the first 16,000 characters and the last 8,000 characters with a fixed truncation marker between them. This leaves room in Jev's 32,000-token context for the rubric and response.

## Scan lifecycle

### Page creation

1. Authenticate the user.
2. Validate and normalize the URL.
3. Insert the D1 `page` row in `pending` state. The unique domain constraint decides ownership.
4. Resolve the Page Durable Object by normalized domain.
5. Call `initializeAndStart(page, userId)`.
6. The object initializes its config, inserts a queued initial run, records `active_run_id`, and creates a Workflow instance with the run ID.
7. Return the page and run without waiting for the scan.

Creation is idempotent for the same owner and normalized domain. If the D1 insert succeeds but the Durable Object call fails, retrying `pages.create` resumes initialization. A different user receives a conflict.

### Manual and alarm triggers

The Durable Object performs the state decision in one SQLite transaction:

1. Read `active_run_id`.
2. If it points to a queued or running run, return that run.
3. Otherwise, insert a new queued run and set `active_run_id`.
After the transaction commits, it creates the Workflow with `id = run.id`. External Workflow I/O never runs inside the SQLite transaction. If Workflow creation fails, the object marks the run failed, clears `active_run_id`, and sets the alarm for one day later.

The alarm uses the same operation with trigger `scheduled`. The manual API uses trigger `manual` and records the user ID.

### Workflow steps

1. Mark the run as running with stage `capture`.
2. In one durable Workflow step, capture rendered HTML, Markdown, and a full-page PNG with one Chromium snapshot.
3. In that same step, validate the final URL and response status, hash the three payloads, and write them to deterministic R2 keys.
4. Return only a small artifact manifest from the step. Large capture payloads never enter persisted Workflow step state.
5. Upsert `page_version` and set stage `persist`.
6. Load the active question set and call Jev once with all questions. Set stage `evaluate`.
7. Upsert all answers in one Durable Object transaction.
8. Compute normalized dimension scores and the overall score.
9. Update `page_public_summary`, `page_owner_state`, and derived page metadata in D1. Set stage `publish`.
10. Mark the run succeeded, clear `active_run_id`, and set the Durable Object alarm to completion time plus seven days.

The Workflow retries capture, R2, Jev, Durable Object, and D1 operations with bounded exponential backoff. Every write is idempotent by run ID.

If all retries fail, the Workflow records a stable error code, clears `active_run_id`, and sets the alarm to completion time plus one day. It performs best-effort removal of partial R2 artifacts when no `page_version` record exists.

## Consistency rules

- The Page Durable Object serializes scan starts. There is one active run per page.
- The run ID is the Workflow ID and the R2 key segment.
- `page_version.run_id` is unique.
- Answer writes use a composite primary key and upsert on retry.
- R2 writes use deterministic keys. A retry may replace a partial object before the version transaction commits.
- The Durable Object stores version and answer data before D1 publishes it.
- The D1 projection accepts only a result whose `scanned_at` is newer than the stored result.
- The public directory reads D1 only. It never fans out across Durable Objects.
- The owner list joins `page` with `page_owner_state`. It does not fan out across Durable Objects.
- The owner page reads D1 for authorization, then one Durable Object for private history.

## API contracts

### Public oRPC procedures

- `directory.list({ cursor, query })`
- `directory.getBySlug({ slug })`

These procedures return active page metadata and the latest public score. They never return artifact keys, errors, run history, user IDs, or raw Jev payloads.

### Owner oRPC procedures

- `pages.listOwned()`
- `pages.create({ url })`
- `pages.getOwned({ pageId })`
- `runs.trigger({ pageId })`
- `runs.get({ pageId, runId })`

Each procedure requires a Better Auth session. Before it calls a Durable Object, it selects the D1 page with both `page.id` and `owner_user_id = session.user.id`. A miss returns not found, not forbidden, so the API does not disclose page ownership.

### Artifact route

```text
GET /api/pages/:pageId/runs/:runId/artifacts/:kind
```

`kind` is `html`, `screenshot`, or `content`. The route authenticates the user, checks D1 ownership, asks the Page Durable Object for the run's artifact key, then streams the private R2 object. It sets a safe content type and download policy for HTML so archived markup cannot execute in the application origin.

## Web routes

### Public

- `/` lists and searches active pricing pages.
- `/pages/$slug` shows the latest public summary and its five dimensions.

### Owner-only

- `/dashboard/pages` lists owned pages and creates a page from a URL.
- `/dashboard/pages/$pageId` shows scan status, next scan time, run history, score details, errors, artifact links, and the manual scan action.

The current login and sign-up routes remain.

## Alchemy provisioning

`packages/infra/alchemy.run.ts` provisions and binds:

- The existing D1 database
- One private R2 bucket
- The Page Durable Object namespace with SQLite storage
- The Scan Workflow
- A Browser Run binding
- A Workers AI binding
- The existing API Worker and web Worker

The server source exports standard Cloudflare `DurableObject` and `WorkflowEntrypoint` classes. Alchemy references those classes in the API Worker's environment bindings. This keeps the existing async Hono code and uses Alchemy for all resource creation and binding.

No Cron Trigger is needed. Each Page Durable Object alarm schedules its page.

## Error handling

Owner-visible runs use stable codes:

- `capture_failed`
- `archive_failed`
- `evaluation_failed`
- `projection_failed`
- `invalid_final_url`
- `workflow_start_failed`

The owner UI shows a short safe message. Logs keep the underlying exception and Cloudflare request identifiers. Logs must not contain raw HTML, Markdown, screenshots, auth secrets, session tokens, or full model input.

## Observability

Extend the current evlog setup with one structured event per run. Include:

- `page_id`
- `run_id`
- `trigger`
- `stage`
- `outcome`
- stage durations
- Browser Run duration
- HTTP status and final host
- artifact byte counts
- Jev model, input tokens, output tokens, and per-question confidence
- overall score
- retry counts
- stable error code

Workflow logs help with active failures. Durable Object run records remain the long-term owner history.

## Test strategy

### Unit tests

- URL scheme, credential, port, IP range, hostname, and redirect validation
- Leading `www.` normalization and subdomain preservation
- Slug generation and collisions
- R2 key generation
- Jev score normalization and overall score calculation
- Public response redaction

### Durable Object integration tests

- Apply the first Drizzle migration to a fresh object
- Reopen an object without applying a migration twice
- Seed the rubric idempotently
- Deduplicate concurrent manual triggers
- Set a seven-day alarm after success
- Set a one-day alarm after terminal failure
- Reset the alarm after a successful manual scan
- Preserve historical question-set versions
- Upsert version and answer writes on Workflow retry

### API integration tests

- Create a page and claim a normalized domain
- Resume an interrupted create for the same owner
- Reject a duplicate claim from another owner
- Hide private runs from public procedures
- Return current state from the owner-only `page_owner_state` projection
- Reject non-owner run and artifact access with not found
- Return the current run when a manual trigger is duplicated

### Workflow integration tests

Use fakes for Browser Run, R2, Workers AI, D1, and the Durable Object RPC boundary.

- Complete the success path in the required write order
- Retry each external step
- Preserve one run ID across all writes
- Refuse an invalid final redirect
- Record each stable terminal error
- Do not publish D1 before Durable Object persistence
- Repair the D1 owner-state projection after a retry
- Do not let an older result replace a newer D1 projection

### Browser smoke test

Test one owner path:

1. Sign up.
2. Add a public HTTPS URL.
3. See a queued run.
4. Trigger a manual scan while it is active.
5. Confirm that the API returns the same run ID.

## Deferred work

- Version comparison and change detection
- Email or in-app notifications
- User-defined questions
- Domain ownership verification
- Teams, collaborators, and ownership transfer
- Pause, edit, and delete
- Metering, quotas, and billing
- Cross-page private run analytics
- Public historical scores
- Kitesurf support

## Trade-offs

### Durable Object history versus D1 history

Keeping private history in the Page Durable Object gives each domain one strong consistency boundary and matches the scheduling model. It makes cross-page historical analytics expensive. The MVP does not need those queries.

### Per-object alarms versus a global scheduler

An alarm naturally represents "seven days after this scan" and avoids a polling job. Each object has one alarm, so all rescheduling must go through one scheduler row and one method.

### D1 public projection

The directory stays fast because it reads one global database. The cost is eventual consistency between the Durable Object and D1. Idempotent projection writes and the `scanned_at` guard make retries safe.

### Chromium only

Chromium uses more Browser Run resources than Kitesurf. It gives the MVP one consistent multi-format snapshot and broader page compatibility. That is the better first implementation.

### First claimant ownership

Skipping domain verification makes onboarding small, but it permits domain squatting. This is an accepted MVP risk.

## Sources

- [Cloudflare Browser Run snapshot](https://developers.cloudflare.com/browser-run/quick-actions/snapshot/)
- [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Cloudflare Durable Objects rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Cloudflare Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/)
- [Drizzle Durable Objects guide](https://orm.drizzle.team/docs/get-started/do-existing)
- [Alchemy Durable Objects](https://alchemy.run/cloudflare/compute/durable-objects/)
- [Alchemy Drizzle migrations](https://alchemy.run/sql/drizzle/migrations/)
