# Pricing Intelligence Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the score-only pricing rubric with one typed Jev evaluation that produces commercial scores, classifications, AI capabilities, and market tags for pricing teams and founders.

**Architecture:** The Scan Workflow sends the captured Markdown and every active question to Jev in one call. The Page Durable Object stores typed raw answers, while D1 stores a latest-successful public projection with normalized scores, choices, signals, and publishable tags. Existing page records remain valid through additive D1 columns and a Durable Object SQLite migration.

**Tech Stack:** TypeScript, Cloudflare Workers AI Jev, Cloudflare Workflows, Durable Objects SQLite, D1, Drizzle ORM, React, Vitest.

---

### Task 1: Define the product target and question set

**Files:**

- Create: `docs/product/target-customer.md`
- Modify: `apps/server/src/pricing/rubric.ts`
- Test: `apps/server/src/pricing/rubric.test.ts`

- [ ] Write a product document that defines pricing teams and founders as the primary target, their decisions, the product promise, and excluded audiences.
- [ ] Write failing tests that require score, choice, and noul questions and verify the controlled market and agent taxonomies.
- [ ] Replace `pricing-quality-v1` with `pricing-intelligence-v2`, including four commercial scores, four mutually exclusive choices, and independent commercial, AI, and market signals.
- [ ] Run `pnpm --filter server test -- rubric.test.ts` and verify it passes.

### Task 2: Persist typed questions and answers in Durable Object SQLite

**Files:**

- Modify: `apps/server/src/pricing/types.ts`
- Modify: `apps/server/src/pricing/do-schema.ts`
- Modify: `apps/server/src/pricing/page-store.ts`
- Modify: `apps/server/src/pricing/do-schema.test.ts`
- Create: `apps/server/src/pricing/drizzle/<generated>/migration.sql`
- Modify: `apps/server/src/pricing/drizzle/migrations.js`

- [ ] Define discriminated unions for persisted score, choice, and noul questions and answers.
- [ ] Change question criteria to accept an ordered array or keyed criteria object.
- [ ] Change answers to store a typed score, choice, or noul value with nullable type-specific metadata.
- [ ] Update rubric seeding to deactivate old sets, activate version 2, and insert every typed question.
- [ ] Generate the Durable Object migration with `pnpm db:generate:do`.
- [ ] Run the server schema tests and verify they pass.

### Task 3: Parse and project one typed Jev response

**Files:**

- Modify: `apps/server/src/pricing/scan-workflow-logic.ts`
- Modify: `apps/server/src/pricing/scan-workflow.test.ts`
- Create: `apps/server/src/pricing/evaluation.ts`
- Create: `apps/server/src/pricing/evaluation.test.ts`
- Modify: `apps/server/src/pricing/scan-workflow.ts`

- [ ] Add failing parser tests for score, choice, and noul answers in one Jev response.
- [ ] Parse each answer according to its persisted question type and reject missing or malformed answers.
- [ ] Add projection tests for normalized scores, accepted choices, raw signals, confidence thresholds, and stable tags.
- [ ] Build the public projection with choice confidence `>= 0.75` and positive noul tags at `>= 0.80`.
- [ ] Keep the entire question map in one `env.AI.run("typesafe/jev", ...)` call.
- [ ] Run the pricing workflow and evaluation tests and verify they pass.

### Task 4: Extend the central D1 public projection

**Files:**

- Modify: `packages/db/src/schema/pages.ts`
- Modify: `packages/db/src/schema/pages.test.ts`
- Create: `packages/db/src/migrations/<generated>/migration.sql`
- Modify: `packages/api/src/routers/directory.ts`

- [ ] Add typed JSON columns for choices, signals, and tags with empty-array defaults for existing rows.
- [ ] Generate the D1 migration with `pnpm db:generate`.
- [ ] Publish all four projection arrays only after the complete Jev response is persisted.
- [ ] Return tags in directory rows and return all typed evaluation fields on public page profiles.
- [ ] Run database and API type checks.

### Task 5: Show commercial intelligence in the directory

**Files:**

- Modify: `apps/web/src/components/score-grid.tsx`
- Create: `apps/web/src/components/intelligence-profile.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/pages/$slug.tsx`
- Modify: `apps/web/src/index.css`

- [ ] Rename score labels to the new commercial score keys.
- [ ] Show up to three high-confidence market or AI tags on each directory row.
- [ ] Show classifications, tags, and positive signals on each public page profile.
- [ ] Keep uncertain signals stored but do not present them as facts.
- [ ] Run web type checking and the repository formatter.

### Task 6: Verify the complete change

**Files:**

- Modify only files that fail verification because of this feature.

- [ ] Run `pnpm --filter server test`.
- [ ] Run `pnpm --filter @my-better-t-app/db test`.
- [ ] Run `pnpm check-types`.
- [ ] Run `pnpm check`.
- [ ] Inspect `git diff --check` and the generated migrations.
- [ ] Confirm that a scan sends all questions in one Jev request and only a complete evaluation can make a pending page public.
