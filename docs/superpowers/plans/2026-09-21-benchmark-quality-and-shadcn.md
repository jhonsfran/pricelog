# Benchmark Quality and shadcn Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make benchmark data comparable and complete, then move changed standard controls to shadcn while decomposing the web stylesheet.

**Architecture:** Benchmark reads have separate bounded-request and complete-scheduled paths. Both filter by a canonical rubric ID, and stored snapshots carry that ID. Shared scoring constants live in the database pricing-intelligence contract. The web keeps custom product visualizations but uses shadcn for standard controls and feedback.

**Tech Stack:** TypeScript, Drizzle ORM, Cloudflare D1 and Cron Triggers, Hono, oRPC, React, TanStack Start, shadcn/ui, Tailwind CSS, Vitest.

---

### Task 1: Make benchmark snapshots versioned and complete

**Files:**

- Modify: `packages/db/src/pricing-intelligence.ts`
- Modify: `packages/db/src/schema/pages.ts`
- Modify: `packages/db/src/migrations/20260920202340_swift_groot/migration.sql`
- Modify: `packages/db/src/migrations/20260920202340_swift_groot/snapshot.json`
- Modify: `packages/api/src/benchmark.ts`
- Modify: `packages/api/src/benchmark-store.ts`
- Modify: `packages/api/src/benchmark.test.ts`
- Create: `packages/api/src/benchmark-store.test.ts`
- Modify: `packages/api/src/routers/directory.ts`
- Modify: `apps/server/src/pricing/rubric.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Add canonical rubric identity and snapshot types**

Export `PRICING_INTELLIGENCE_RUBRIC_ID = "pricing-intelligence-v3"` and `PRICING_INTELLIGENCE_RUBRIC_VERSION = 3` from the shared pricing-intelligence module. Use them in the server rubric. Add `rubricId` to `benchmark_snapshot`, its unique index, and the migration.

```ts
export const PRICING_INTELLIGENCE_RUBRIC_ID = "pricing-intelligence-v3";
export const PRICING_INTELLIGENCE_RUBRIC_VERSION = 3;

rubricId: text("rubric_id").notNull(),
uniqueIndex("benchmark_snapshot_rubric_cohort_computed_at_idx").on(
  table.rubricId,
  table.cohort,
  table.computedAt,
),
```

- [ ] **Step 2: Add failing store tests**

Test two explicit read policies: `readLiveBenchmarkCorpus` stops at its limit and filters by rubric ID; `readCompleteBenchmarkCorpus` follows pages until fewer than the batch size remain. Test that latest snapshots are selected by rubric ID.

```ts
expect(await readLiveBenchmarkCorpus(db, rubricId, 2)).toHaveLength(2);
expect(await readCompleteBenchmarkCorpus(db, rubricId, 2)).toHaveLength(5);
expect((await loadBenchmarks(db, rubricId)).snapshots.every((row) => row.rubricId === rubricId)).toBe(true);
```

- [ ] **Step 3: Implement separate corpus readers**

Use keyset pagination on `(page.id)` for the scheduled path. Keep the request fallback limit in `readLiveBenchmarkCorpus`. Make `computeBenchmarks` accept a reader result or an explicit read policy so the scheduled path cannot call the bounded reader by mistake.

```ts
export async function readLiveBenchmarkCorpus(
  db: Database,
  rubricId: string,
  limit = LIVE_FALLBACK_LIMIT,
): Promise<BenchmarkPage[]>;

export async function readCompleteBenchmarkCorpus(
  db: Database,
  rubricId: string,
  batchSize = 500,
): Promise<BenchmarkPage[]>;

export function computeBenchmarks(pages: BenchmarkPage[]): BenchmarkSnapshot[] {
  return buildBenchmarkSnapshots(pages);
}
```

- [ ] **Step 4: Version snapshot writes and reads**

Write `rubricId` on every snapshot row. Select latest `computedAt` within the requested rubric. Update the uniqueness constraint to `(rubricId, cohort, computedAt)`.

```ts
export async function loadBenchmarks(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
): Promise<BenchmarkReading>;

export async function storeBenchmarks(
  db: Database,
  rubricId = PRICING_INTELLIGENCE_RUBRIC_ID,
  computedAt = new Date(),
): Promise<number>;
```

- [ ] **Step 5: Expose compatible and total counts**

Return the compatible current-rubric page count as `indexedPages` and the complete active directory count as `totalIndexedPages`. Keep peer comparisons restricted to current-rubric snapshots.

```ts
return {
  computedAt,
  live,
  indexedPages: allSnapshot?.pageCount ?? 0,
  totalIndexedPages,
  minimumCohortSize: COHORT_MINIMUM,
  available,
  selected,
};
```

- [ ] **Step 6: Fix scheduled logging**

Call `log.error` in the scheduled job catch block, preserve the original `Error`, and rethrow it so Cloudflare records the cron failure.

```ts
} catch (error) {
  const cause = error instanceof Error ? error : new Error(String(error));
  log.error(cause);
  throw cause;
}
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
pnpm --filter @my-better-t-app/db test
pnpm --filter @my-better-t-app/api test
pnpm --filter server test
pnpm --filter server check-types
```

Expected: all tests and type checks pass.

Commit message: `fix: make benchmark snapshots complete and comparable`.

### Task 2: Publish thresholds from one contract

**Files:**

- Modify: `packages/db/src/pricing-intelligence.ts`
- Modify: `apps/server/src/pricing/evaluation.ts`
- Modify: `apps/server/src/pricing/evaluation.test.ts`
- Modify: `apps/web/src/routes/methodology.tsx`
- Modify: `packages/api/src/pricing-intelligence.test.ts`

- [ ] **Step 1: Move the choice threshold**

Export `CHOICE_CONFIDENCE_THRESHOLD = 0.75` beside `TAG_PROBABILITY_THRESHOLD`. Remove the server-local and web-local copies.

```ts
export const CHOICE_CONFIDENCE_THRESHOLD = 0.75;
export const TAG_PROBABILITY_THRESHOLD = 0.8;
```

- [ ] **Step 2: Assert contract use**

Add a shared-contract test that checks the exported threshold. Keep evaluator tests for answers immediately below and at the threshold.

```ts
expect(CHOICE_CONFIDENCE_THRESHOLD).toBe(0.75);
expect(buildPublicEvaluation([choiceAnswer({ confidence: 0.749 })]).choices).toEqual([]);
expect(buildPublicEvaluation([choiceAnswer({ confidence: 0.75 })]).choices).toHaveLength(1);
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
pnpm --filter @my-better-t-app/api test
pnpm --filter server test
pnpm --filter web check-types
```

Expected: all commands pass and methodology renders the imported threshold.

Commit message: `refactor: share pricing intelligence thresholds`.

### Task 3: Add the required shadcn components

**Files:**

- Modify or create through CLI: `packages/ui/src/components/field.tsx`
- Modify or create through CLI: `packages/ui/src/components/toggle-group.tsx`
- Inspect: `packages/ui/src/components/button.tsx`
- Inspect: `packages/ui/src/components/input.tsx`
- Inspect: `packages/ui/src/components/skeleton.tsx`

- [ ] **Step 1: Inspect project and component documentation**

Run:

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs button input field skeleton toggle-group
```

Use the Base UI APIs reported by the project. Do not use Radix-only `asChild` APIs.

- [ ] **Step 2: Preview missing components**

Run `pnpm dlx shadcn@latest add field toggle-group --dry-run`, then inspect diffs for every target file.

- [ ] **Step 3: Install and inspect source**

Run `pnpm dlx shadcn@latest add field toggle-group`. Read both generated files and correct aliases or icons if required.

- [ ] **Step 4: Verify the UI package**

Run `pnpm --filter @my-better-t-app/ui check-types`.

Expected: type check passes.

### Task 4: Convert standard controls to shadcn

**Files:**

- Modify: `apps/web/src/components/auth-field.tsx`
- Modify: `apps/web/src/components/sign-in-form.tsx`
- Modify: `apps/web/src/components/sign-up-form.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard/index.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard/pages/$pageId.tsx`
- Modify: `apps/web/src/routes/benchmarks.tsx`
- Modify: `apps/web/src/components/loader.tsx`

- [ ] **Step 1: Convert authentication forms**

Compose `FieldGroup`, `Field`, `FieldLabel`, `FieldError`, `Input`, and `Button`. Pass validation with `data-invalid` and `aria-invalid`. Keep TanStack Form field state typed without an error-array cast.

```tsx
<Field data-invalid={!field.state.meta.isValid}>
  <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
  <Input
    id={field.name}
    name={field.name}
    value={field.state.value}
    onBlur={field.handleBlur}
    onChange={(event) => field.handleChange(event.target.value)}
    aria-invalid={!field.state.meta.isValid}
  />
  <FieldError errors={field.state.meta.errors} />
</Field>
```

- [ ] **Step 2: Convert actions and search input**

Use `Button` for submit, scan, load-more, and switch actions. Use `Input` for directory search and add-page input. Keep layout classes only; use component variants for control appearance.

```tsx
<Button type="submit" disabled={!canSubmit || isSubmitting}>
  {isSubmitting ? "Submitting…" : label}
</Button>
```

- [ ] **Step 3: Convert loading placeholders**

Use `Skeleton` for directory and owner rows and the shadcn spinner or existing Loader composition for application loading.

```tsx
<Skeleton className="h-2.5" style={{ width }} />
```

- [ ] **Step 4: Convert cohort selection**

Use a single-value `ToggleGroup` with `ToggleGroupItem`. Preserve cohort counts and prevent an empty selection from replacing the current cohort.

```tsx
<ToggleGroup
  value={[cohort]}
  onValueChange={(value) => {
    const next = value[0];
    if (next) setCohort(next);
  }}
>
  {available.map((item) => (
    <ToggleGroupItem key={item.cohort} value={item.cohort}>
      {item.label} <small>{item.pageCount}</small>
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

- [ ] **Step 5: Verify behavior**

Run `pnpm --filter web check-types`.

Expected: production client and SSR builds plus TypeScript pass.

### Task 5: Decompose styles and fix the peer marker

**Files:**

- Modify: `apps/web/src/index.css`
- Create: `apps/web/src/styles/foundation.css`
- Create: `apps/web/src/styles/directory.css`
- Create: `apps/web/src/styles/profile.css`
- Create: `apps/web/src/styles/auth.css`
- Create: `apps/web/src/styles/benchmarks.css`

- [ ] **Step 1: Split styles by owner**

Move existing rules without changing declarations. Keep imports in cascade order: foundation, directory, profile, auth, benchmarks. Keep each file below 700 lines.

```css
@import "./styles/foundation.css";
@import "./styles/directory.css";
@import "./styles/profile.css";
@import "./styles/auth.css";
@import "./styles/benchmarks.css";
```

- [ ] **Step 2: Remove recreated control styles**

Delete CSS that restyles shadcn control internals. Retain layout hooks and product-specific data presentation.

```css
.auth-form {
  display: grid;
  gap: 20px;
}

.cohort-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

- [ ] **Step 3: Fix score fill ownership**

Add a `score-fill` class to the fill span and target `.score-fill` instead of every `.score-track span`. Ensure `.score-peer-marker` has no scale transform.

```tsx
<span className="score-fill" style={{ "--fill": fillRatio(item.score) } as CSSProperties} />
```

```css
.score-fill {
  transform: scaleX(var(--fill, 0));
}

.score-peer-marker {
  transform: none;
}
```

- [ ] **Step 4: Verify generated CSS**

Run `pnpm --filter web check-types` and inspect the built CSS size and warnings.

Expected: build passes, peer marker styles include `transform: none`, and no source stylesheet exceeds 1,000 lines.

- [ ] **Step 5: Commit UI work**

Commit message: `refactor: adopt shadcn controls and split web styles`.

### Task 6: Commit the remaining feature files and verify the repository

**Files:**

- Include all remaining intended uncommitted benchmark, rubric, product documentation, migration, port, and interface changes.
- Exclude generated build output and unrelated user files.

- [ ] **Step 1: Review remaining changes**

Run `git status --short` and `git diff --stat`. Confirm every remaining file belongs to the benchmark-index change.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm exec turbo run test check-types --force
pnpm exec oxlint apps/server/src apps/web/src packages/api/src packages/db/src packages/ui/src
pnpm exec oxfmt --check .
git diff --check
```

Expected: all checks pass with no formatting or whitespace errors.

- [ ] **Step 3: Run browser verification**

Start the existing development stack. Check desktop and mobile widths for directory search, authentication fields, loading skeletons, cohort selection, benchmark distributions, and the page-profile peer marker. Confirm keyboard focus and reduced-motion behavior.

- [ ] **Step 4: Commit remaining feature work**

Commit message: `feat: publish the pricing benchmark index`.

- [ ] **Step 5: Confirm clean state**

Run `git status --short` and `git log -6 --oneline`.

Expected: no uncommitted files and distinct commits for design, data integrity, shared contracts, UI refactor, and the feature remainder.
