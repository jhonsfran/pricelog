# Pricing Monitor Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six blocking and maintainability findings from the branch review without changing intended product behavior.

**Architecture:** Treat page creation as an idempotent provisioning operation across D1 and the Page Durable Object. Keep Durable Object terminal run states immutable and treat D1 owner state as a retryable projection. Use one dual-stack DNS resolver, one composite cursor contract, and one shared public intelligence catalog. Extract page descriptions from captured HTML at the capture boundary.

**Tech Stack:** TypeScript, Hono, oRPC, Drizzle ORM, Cloudflare D1, Durable Objects, Workflows, React, TanStack Query, Vitest.

---

### Task 1: Recoverable page provisioning

**Files:**

- Modify: `packages/api/src/routers/pages.ts`
- Modify: `apps/server/src/pricing/page-store.ts`
- Test: `packages/api/src/routers/pages.test.ts`
- Test: `apps/server/src/pricing/page-store.test.ts`

- [ ] **Step 1: Write failing tests for the provisioning decisions**

Add pure decision coverage that proves an existing page owned by the caller must continue through provisioning, while a page owned by another user returns a conflict. Add Durable Object state logic coverage that proves an existing initial run is reused instead of creating a second initial run.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
pnpm --filter @my-better-t-app/api test -- pages.test.ts
pnpm --filter server test -- page-store.test.ts
```

Expected: the new helper expectations fail before implementation.

- [ ] **Step 3: Implement one idempotent provisioning path**

Use a D1 batch for the `page` and `page_owner_state` inserts. Re-read the domain winner after the batch or a uniqueness race. Reject a different owner. For the same owner, ensure `page_owner_state` exists and always call `initializeAndStart`. In `PageStore.initializeAndStart`, return an existing initial run if one exists; create the initial run only when the run table is empty.

- [ ] **Step 4: Run the focused tests**

Run the two commands from Step 2. Expected: PASS.

### Task 2: Immutable terminal scan outcomes

**Files:**

- Modify: `apps/server/src/pricing/page-store.ts`
- Modify: `apps/server/src/pricing/scan-workflow.ts`
- Test: `apps/server/src/pricing/page-store.test.ts`
- Test: `apps/server/src/pricing/scan-workflow.test.ts`

- [ ] **Step 1: Write failing tests for terminal transition policy**

Add a pure transition helper test with these cases:

```ts
expect(resolveRunCompletion("running", "succeeded")).toBe("apply");
expect(resolveRunCompletion("succeeded", "succeeded")).toBe("reuse");
expect(() => resolveRunCompletion("succeeded", "failed")).toThrow();
```

- [ ] **Step 2: Run focused tests and verify failure**

Run `pnpm --filter server test -- page-store.test.ts scan-workflow.test.ts`. Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Guard terminal transitions and separate projection publication**

Make `complete` read the run inside the Durable Object transaction. Apply a transition only from `queued` or `running`; reuse the stored completion for the same terminal outcome; reject the opposite terminal outcome. Set the alarm only for a newly applied transition. Split owner-success projection into its own retrying Workflow step. Before recording terminal failure, read the authoritative run and skip failure mutation when it already succeeded.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2. Expected: PASS.

### Task 3: Canonical dual-stack DNS resolution

**Files:**

- Modify: `apps/server/src/pricing/url.ts`
- Modify: `apps/server/src/pricing/service.ts`
- Modify: `apps/server/src/pricing/scan-workflow.ts`
- Test: `apps/server/src/pricing/url.test.ts`

- [ ] **Step 1: Write a failing dual-stack resolver test**

Use an injected fetch implementation that returns one A record and one AAAA record. Assert that `resolveDnsAddresses` returns both values.

- [ ] **Step 2: Run `pnpm --filter server test -- url.test.ts` and verify failure**

Expected: FAIL because `resolveDnsAddresses` does not exist.

- [ ] **Step 3: Implement and reuse the resolver**

Export `resolveDnsAddresses(hostname, fetcher = fetch)` from `url.ts`. Query A and AAAA concurrently, validate both responses, and filter record types 1 and 28. Delete both local resolver implementations and pass this function to `normalizePricingUrl` in both call sites.

- [ ] **Step 4: Run the focused test**

Run `pnpm --filter server test -- url.test.ts`. Expected: PASS.

### Task 4: Total composite pagination

**Files:**

- Create: `packages/api/src/pagination.ts`
- Modify: `packages/api/src/context.ts`
- Modify: `packages/api/src/routers/directory.ts`
- Modify: `apps/server/src/pricing/page-store.ts`
- Modify: `apps/server/src/pricing/service.ts`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard/pages/$pageId.tsx`
- Test: `packages/api/src/routers/pages.test.ts`
- Test: `apps/server/src/pricing/page-store.test.ts`

- [ ] **Step 1: Add failing cursor predicate tests**

Define expected descending cursor behavior: rows before the cursor satisfy `createdAt < cursor.createdAt`, or equal timestamps satisfy `id < cursor.id`. Add SQL-generation tests for both central and Durable Object query helpers.

- [ ] **Step 2: Run API and server focused tests and verify failure**

Run the Task 1 focused commands. Expected: FAIL because the cursor helpers do not exist.

- [ ] **Step 3: Implement the shared cursor contract**

Create:

```ts
export type DescendingTimestampCursor = { createdAt: number; id: string };
```

Use a matching Zod schema in the directory input. Apply the lexicographic predicate in both queries. Return both cursor fields. Update service contracts accordingly.

- [ ] **Step 4: Consume pagination in both clients**

Use `useInfiniteQuery` with oRPC `infiniteOptions` for the public directory. Flatten pages and add a `Load more` button when `hasNextPage`. Extend the owner procedure input with an optional run cursor and use the same pattern, or provide an explicit next-page control that appends runs.

- [ ] **Step 5: Run focused tests and web type checks**

Run:

```bash
pnpm --filter @my-better-t-app/api test -- pages.test.ts
pnpm --filter server test -- page-store.test.ts
pnpm --filter web check-types
```

Expected: PASS.

### Task 5: Shared public intelligence catalog

**Files:**

- Create: `packages/db/src/pricing-intelligence.ts`
- Modify: `packages/db/src/schema/pages.ts`
- Modify: `apps/server/src/pricing/rubric.ts`
- Modify: `apps/server/src/pricing/evaluation.ts`
- Modify: `apps/web/src/components/intelligence-profile.tsx`
- Test: `apps/server/src/pricing/rubric.test.ts`
- Test: `apps/server/src/pricing/evaluation.test.ts`

- [ ] **Step 1: Add failing exhaustiveness tests**

Assert that all rubric choice and signal keys exist in the public catalog and that tag thresholds and priorities come from the catalog.

- [ ] **Step 2: Run the focused tests and verify failure**

Run `pnpm --filter server test -- rubric.test.ts evaluation.test.ts`. Expected: FAIL because the catalog does not exist.

- [ ] **Step 3: Implement the catalog and derived consumers**

Define score labels, choice labels, and signal metadata in `packages/db/src/pricing-intelligence.ts` with literal key unions, then use those unions in the stored JSON contracts. Make the rubric question object satisfy the full key union. Derive evaluator tags and UI labels from this catalog. Remove local maps, casts, and the duplicated `0.8` threshold.

- [ ] **Step 4: Run focused tests and type checks**

Run the command from Step 2, then `pnpm check-types`. Expected: PASS.

### Task 6: Page description extraction

**Files:**

- Modify: `apps/server/src/pricing/scan-workflow-logic.ts`
- Modify: `apps/server/src/pricing/scan-workflow.ts`
- Test: `apps/server/src/pricing/scan-workflow.test.ts`

- [ ] **Step 1: Add failing metadata extraction tests**

Cover `name="description"`, reversed attribute order, Open Graph fallback, entity decoding, whitespace normalization, and missing metadata.

- [ ] **Step 2: Run `pnpm --filter server test -- scan-workflow.test.ts` and verify failure**

Expected: FAIL because `extractPageDescription` does not exist.

- [ ] **Step 3: Extract and publish the description**

Add a small pure HTML metadata extractor in `scan-workflow-logic.ts`. Return the description beside the artifact manifest from the capture step. Set `page.description` during public projection publication.

- [ ] **Step 4: Run the focused test**

Run `pnpm --filter server test -- scan-workflow.test.ts`. Expected: PASS.

### Task 7: Full verification

**Files:**

- Verify all modified files

- [ ] **Step 1: Run formatting and lint checks**

Run `pnpm exec oxfmt --check .`, `pnpm exec oxlint`, and `git diff --check`. Expected: PASS.

- [ ] **Step 2: Run all tests and type checks**

Run `pnpm test` and `pnpm check-types`. Expected: PASS.

- [ ] **Step 3: Review the final diff**

Confirm that no file crosses 1,000 lines, no unrelated user changes were removed, migrations remain registered, and every finding has direct test coverage.
