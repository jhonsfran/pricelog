# Quality Score Question Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible information tooltip to each known quality score so readers can see the exact question used to calculate it.

**Architecture:** Store the evaluation question beside each score label in the shared pricing catalog. The server rubric reads the shared question, while the web score grid reads the same metadata and renders the existing Base UI tooltip component. Unknown historical keys keep their current fallback label and omit the tooltip.

**Tech Stack:** TypeScript, React 19, Base UI tooltip, Vitest, Testing Library, CSS

---

## File structure

- Modify `packages/db/src/pricing-intelligence.ts` to make each known score's label and question the shared source of truth.
- Modify `packages/api/src/pricing-intelligence.ts` to expose nullable score metadata while preserving the existing fallback label helper.
- Modify `packages/api/src/pricing-intelligence.test.ts` to test known metadata and unknown-key behavior.
- Modify `apps/server/src/pricing/rubric.ts` to read score questions from the shared catalog.
- Modify `apps/server/src/pricing/rubric.test.ts` to prevent server and UI question text from drifting apart.
- Modify `apps/web/src/components/score-grid.tsx` to render the information button and tooltip.
- Create `apps/web/src/components/score-grid.test.tsx` to test known and unknown score rendering.
- Modify `apps/web/src/index.css` to style the label group, trigger, focus state, and tooltip.

### Task 1: Share score questions across the server and client

**Files:**

- Modify: `packages/db/src/pricing-intelligence.ts`
- Modify: `packages/api/src/pricing-intelligence.ts`
- Modify: `packages/api/src/pricing-intelligence.test.ts`
- Modify: `apps/server/src/pricing/rubric.ts`
- Modify: `apps/server/src/pricing/rubric.test.ts`

- [ ] **Step 1: Write failing metadata and rubric consistency tests**

Extend `packages/api/src/pricing-intelligence.test.ts`:

```ts
import {
  getPricingChoiceLabel,
  getPricingScoreLabel,
  getPricingScoreMetadata,
  getPricingSignalMetadata,
} from "./pricing-intelligence";

it("exposes the evaluation question for known scores only", () => {
  expect(getPricingScoreMetadata("cost_predictability")).toEqual({
    label: "Cost predictability",
    question: "How well can a buyer predict their actual recurring cost?",
  });
  expect(getPricingScoreMetadata("pricing_transparency")).toBeNull();
});
```

Extend `apps/server/src/pricing/rubric.test.ts` inside the existing `describe` block:

```ts
it("uses the public score questions as rubric instructions", () => {
  for (const [key, metadata] of Object.entries(PRICING_SCORE_CATALOG)) {
    expect(PRICING_INTELLIGENCE_V2.questions[key as keyof typeof PRICING_SCORE_CATALOG]).toMatchObject({
      type: "score",
      instructions: metadata.question,
    });
  }
});
```

- [ ] **Step 2: Run the focused tests and verify that they fail**

Run:

```bash
pnpm --filter @my-better-t-app/api test -- pricing-intelligence.test.ts
pnpm --filter server test -- src/pricing/rubric.test.ts
```

Expected: the API test fails because `getPricingScoreMetadata` does not exist, and the server test fails because score catalog entries do not have `question`.

- [ ] **Step 3: Add questions to the shared catalog**

Replace `PRICING_SCORE_CATALOG` in `packages/db/src/pricing-intelligence.ts` with:

```ts
export const PRICING_SCORE_CATALOG = {
  cost_predictability: {
    label: "Cost predictability",
    question: "How well can a buyer predict their actual recurring cost?",
  },
  packaging_segmentation: {
    label: "Packaging segmentation",
    question: "How well do the plans map different customer needs to a clear upgrade path?",
  },
  offer_differentiation: {
    label: "Offer differentiation",
    question: "How clearly does the page explain why a buyer should select each offer?",
  },
  purchase_actionability: {
    label: "Purchase actionability",
    question: "How clear is the next step to buy, try, or contact sales?",
  },
} as const;
```

Add this helper to `packages/api/src/pricing-intelligence.ts` and update the label helper to use it:

```ts
export function getPricingScoreMetadata(key: string) {
  return isPricingScoreKey(key) ? PRICING_SCORE_CATALOG[key] : null;
}

export function getPricingScoreLabel(key: string): string {
  return getPricingScoreMetadata(key)?.label ?? formatPricingKey(key);
}
```

In `apps/server/src/pricing/rubric.ts`, import `PRICING_SCORE_CATALOG` as a runtime value and replace the four score question strings with shared catalog values:

```ts
cost_predictability: score(PRICING_SCORE_CATALOG.cost_predictability.question, [
  "The buyer cannot estimate any cost.",
  "Only a starting price or contact-sales path is available.",
  "Standard prices exist, but important cost variables or conditions are missing.",
  "Most buyers can estimate a normal monthly or annual cost.",
  "The buyer can estimate the normal cost, material overages, and important conditions.",
]),
packaging_segmentation: score(PRICING_SCORE_CATALOG.packaging_segmentation.question, [
  "Plans have no clear differences or upgrade path.",
  "Differences are mainly labels or arbitrary feature removal.",
  "Some meaningful features or limits separate the plans.",
  "Each plan maps to a clear customer need or operating scale.",
  "The plans create a coherent path from entry through expansion.",
]),
offer_differentiation: score(PRICING_SCORE_CATALOG.offer_differentiation.question, [
  "The offers cannot be distinguished.",
  "The page lists plans but gives little basis for selection.",
  "Some plan differences are clear, but intended fit remains ambiguous.",
  "Major differences and intended customer fit are clear.",
  "Each offer has a distinct value proposition, buyer fit, and trade-off.",
]),
purchase_actionability: score(PRICING_SCORE_CATALOG.purchase_actionability.question, [
  "The page gives no purchase path.",
  "A generic contact path exists, but the next step is unclear.",
  "A call to action exists, but its prerequisites or expected outcome are unclear.",
  "Most offers have a clear next action and enough context to proceed.",
  "Every purchase path states the action and relevant trial, contract, or sales expectations.",
]),
```

- [ ] **Step 4: Run the focused tests and verify that they pass**

Run:

```bash
pnpm --filter @my-better-t-app/api test -- pricing-intelligence.test.ts
pnpm --filter server test -- src/pricing/rubric.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit the shared metadata change**

```bash
git add packages/db/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.test.ts apps/server/src/pricing/rubric.ts apps/server/src/pricing/rubric.test.ts
git commit -m "refactor(pricing): share quality score questions"
```

### Task 2: Render accessible question tooltips

**Files:**

- Create: `apps/web/src/components/score-grid.test.tsx`
- Modify: `apps/web/src/components/score-grid.tsx`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Write the failing component tests**

Create `apps/web/src/components/score-grid.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScoreGrid } from "./score-grid";

afterEach(cleanup);

describe("ScoreGrid", () => {
  it("adds an accessible question trigger for a known score", () => {
    render(<ScoreGrid scores={[{ key: "cost_predictability", score: 76, confidence: 0.62 }]} />);

    expect(screen.getByRole("button", { name: "How Cost predictability is calculated" })).toBeTruthy();
  });

  it("keeps an unknown historical score readable without a question trigger", () => {
    render(<ScoreGrid scores={[{ key: "pricing_transparency", score: 70, confidence: 0.5 }]} />);

    expect(screen.getByText("Pricing transparency")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the component test and verify that it fails**

Run:

```bash
pnpm exec vitest run apps/web/src/components/score-grid.test.tsx
```

Expected: the known-score test fails because no information button exists.

- [ ] **Step 3: Render the shared question in the existing tooltip component**

Update `apps/web/src/components/score-grid.tsx`:

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@my-better-t-app/ui/components/tooltip";
import {
  getPricingScoreLabel,
  getPricingScoreMetadata,
} from "@my-better-t-app/api/pricing-intelligence";
import { Info } from "lucide-react";

export type DisplayScore = { key: string; score: number; confidence: number };

export function ScoreGrid({ scores }: { scores: DisplayScore[] }) {
  return (
    <TooltipProvider>
      <div className="score-grid">
        {scores.map((item, index) => {
          const label = getPricingScoreLabel(item.key);
          const metadata = getPricingScoreMetadata(item.key);

          return (
            <div className="score-row" key={item.key} style={{ animationDelay: `${index * 45}ms` }}>
              <div className="score-meta">
                <span className="score-label">
                  <span>{label}</span>
                  {metadata ? (
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        closeOnClick={false}
                        className="score-info-button"
                        aria-label={`How ${label} is calculated`}
                      >
                        <Info aria-hidden="true" size={13} />
                      </TooltipTrigger>
                      <TooltipContent className="score-question-tooltip">
                        {metadata.question}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
                <span className="score-number">{Math.round(item.score)}</span>
              </div>
              <div
                className="score-track"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.score)}
              >
                <span style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
              </div>
              <span className="score-confidence">{Math.round(item.confidence * 100)}% confidence</span>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
```

Add these rules after `.score-meta` in `apps/web/src/index.css`:

```css
.score-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.score-info-button {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: help;
}
.score-info-button:hover,
.score-info-button:focus-visible,
.score-info-button[data-popup-open] {
  color: var(--paper);
}
.score-info-button:focus-visible {
  outline: 1px solid var(--acid);
  outline-offset: 2px;
}
.score-question-tooltip {
  max-width: min(320px, calc(100vw - 32px));
  border: 1px solid #444;
  background: #161616;
  color: var(--paper);
  font: 400 11px/1.45 var(--mono);
}
```

- [ ] **Step 4: Run the component test and type checks**

Run:

```bash
pnpm exec vitest run apps/web/src/components/score-grid.test.tsx
pnpm --filter web check-types
pnpm --filter @my-better-t-app/ui check-types
```

Expected: the component tests and both type checks pass.

- [ ] **Step 5: Verify the interaction in a browser**

Start the existing web development command and inspect an owner detail or public profile with score data. Confirm:

- Pointer hover opens the correct question.
- Tab focus opens the tooltip and shows a visible focus ring.
- Escape closes the tooltip.
- Touch or mobile emulation can activate the trigger without hiding the visible score label.
- An unknown score fixture renders its fallback label without an empty trigger.

- [ ] **Step 6: Commit the web tooltip**

```bash
git add apps/web/src/components/score-grid.tsx apps/web/src/components/score-grid.test.tsx apps/web/src/index.css
git commit -m "feat(web): explain quality score questions"
```

### Task 3: Run final verification

**Files:**

- Verify: `packages/db/src/pricing-intelligence.ts`
- Verify: `packages/api/src/pricing-intelligence.ts`
- Verify: `apps/server/src/pricing/rubric.ts`
- Verify: `apps/web/src/components/score-grid.tsx`

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
pnpm --filter @my-better-t-app/api test -- pricing-intelligence.test.ts
pnpm --filter server test -- src/pricing/rubric.test.ts
pnpm exec vitest run apps/web/src/components/score-grid.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run repository formatting and lint checks for changed source files**

Run:

```bash
pnpm exec oxfmt --check packages/db/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.test.ts apps/server/src/pricing/rubric.ts apps/server/src/pricing/rubric.test.ts apps/web/src/components/score-grid.tsx apps/web/src/components/score-grid.test.tsx apps/web/src/index.css
pnpm exec oxlint packages/db/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.test.ts apps/server/src/pricing/rubric.ts apps/server/src/pricing/rubric.test.ts apps/web/src/components/score-grid.tsx apps/web/src/components/score-grid.test.tsx
```

Expected: both commands exit with status 0.

- [ ] **Step 3: Review the final diff for scope and user changes**

Run:

```bash
git diff --check
git status --short
git diff -- packages/db/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.ts packages/api/src/pricing-intelligence.test.ts apps/server/src/pricing/rubric.ts apps/server/src/pricing/rubric.test.ts apps/web/src/components/score-grid.tsx apps/web/src/components/score-grid.test.tsx apps/web/src/index.css
```

Expected: no whitespace errors, no unrelated edits, and all pre-existing worktree changes remain intact.
