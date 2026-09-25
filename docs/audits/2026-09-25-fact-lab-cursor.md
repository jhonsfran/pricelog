# Fact lab: turning pricing pages into facts with Jev

Dates: 2026-09-24 to 2026-09-25. Harness: `apps/server/scripts/fact-lab/`. Model: `typesafe/jev`, `jev-1.13.0`, through a local Workers AI proxy.

## Summary

The production collector (`collectPricingFacts`, working tree at the time of measurement) accepted **0 facts on 9 of 9 pages**. It used about 71k input tokens per capture, 25× the page's own size.

The final lab design, `names-v16a`, accepts 126 facts across 22 captures with **1 wrong fact**. It uses about 9.2k tokens per capture, one Jev request per page, and costs roughly $0.0004 per capture at the list price.

- **What makes it work:** a small state per price literal, one kind question per price, and one yes/no question per candidate plan name. Code owns values, units, periods, currency and attribution.
- **Generalization:** on pages each variant had never seen, precision rose from 0.29–0.50 (early variants) to 1.00 and 0.67 (`names-v15a`). The remaining error class is capture-level, not extraction.
- **Stability:** Jev is not deterministic, so two design rules are required.
  1. Strip noise from state so unchanged content produces byte-identical requests.
  2. Reuse cached decisions for identical requests.

  With both, noise-only captures produce identical facts.

The whole lab cost 326 distinct Jev requests and 2.25M input tokens, about $0.09 at TypeSafe's list price of $0.042 per million input tokens. Workers AI pricing may differ.

**Caveat.** Gold labels are drafts written by the agent and are **not owner-approved**. Treat every metric as provisional until the gold in `apps/server/scripts/fact-lab/gold/` is reviewed.

## Method

- **Pages:** 9 pages and 22 distinct captures from local dev R2.
  - Primary page: cursor.com, 9 runs collapsing to 2 distinct versions across a real redesign.
  - Holdout rounds: fin.ai and devin.ai, then otter.ai and vapi.ai, then bolt.new and chatbase.co, then lovable.dev and fathom.ai.
  - Each holdout round was labeled before any variant ran on it, and used for tuning only afterwards.
- **Gold:** every commercial price a visitor can see, with an exact literal from the archived Markdown. Hidden UI states, promotions and out-of-schema facts are labeled so that extracting them counts as wrong.
- **Scoring:** precision counts false facts, including wrong plan, role or amount and wrong definite terms. Recall counts attributed matches. An unknown field is "incomplete", not wrong. A bare `$` where the page states USD counts as incomplete.
- **Versioning:** every variant is immutable and fingerprinted over its source files and settings. The baseline fingerprint covers the production pipeline files. Runs append to `experiments.jsonl` with the git commit. A content-addressed response cache makes re-scoring free.

## Results

Each cell is precision (lowest over captures) / recall (mean). "–" means nothing was accepted. Values come from cached runs with the final scorer.

| Variant       | cursor.com | fin.ai    | devin.ai  | otter.ai  | vapi.ai   | bolt.new  | chatbase.co | lovable.dev | fathom.ai | Accepted | Wrong | Tokens/capture |
| ------------- | ---------- | --------- | --------- | --------- | --------- | --------- | ----------- | ----------- | --------- | -------- | ----- | -------------- |
| `baseline`    | –/0.00     | –/0.00    | –/0.00    | –/0.00    | –/0.00    | –/0.00    | –/0.00      | –/0.00      | –/0.00    | 0        | 0     | 70,867 (25.4×) |
| `cards-v1`    | 1.00/0.12  | 0.46/0.38 | 0.45/0.00 | 0.50/0.00 | 0.33/0.00 | 1.00/0.00 | 0.50/0.25   | 1.00/1.00   | 0.71/0.00 | 186      | 25    | 6,370 (2.3×)   |
| `cards-v3c`   | 1.00/1.00  | 0.50/0.06 | 0.44/0.00 | 0.00/0.00 | 0.25/0.12 | 0.00/0.00 | 0.50/0.12   | 1.00/1.00   | 0.09/0.00 | 141      | 38    | 3,936 (1.4×)   |
| `windows-v4a` | 1.00/1.00  | 0.71/0.38 | 0.67/1.00 | 0.40/0.80 | 0.39/0.75 | 0.75/0.75 | 0.78/0.88   | 1.00/1.00   | 0.44/0.50 | 181      | 47    | 7,402 (2.7×)   |
| `names-v5a`   | 1.00/0.88  | 1.00/0.88 | 0.67/1.00 | 0.31/0.80 | 0.35/0.75 | 0.75/0.75 | 0.67/0.75   | 1.00/1.00   | 0.50/0.62 | 183      | 50    | 8,845 (3.2×)   |
| `names-v8a`   | 1.00/1.00  | 1.00/0.88 | 1.00/1.00 | 0.40/0.80 | 0.29/0.50 | 0.60/0.50 | 0.70/0.75   | 1.00/1.00   | 0.44/0.12 | 155      | 41    | 8,000 (2.9×)   |
| `names-v9b`   | 1.00/1.00  | 1.00/0.75 | 1.00/0.83 | 0.83/1.00 | 0.75/0.50 | 0.60/0.50 | 0.70/0.75   | 1.00/1.00   | 0.62/0.88 | 135      | 14    | 9,664 (3.5×)   |
| `names-v13a`  | 1.00/1.00  | 1.00/0.88 | 1.00/0.83 | 1.00/1.00 | 1.00/0.50 | 0.60/0.50 | 0.78/0.75   | 1.00/1.00   | 0.62/0.88 | 133      | 11    | 9,161 (3.3×)   |
| `names-v15a`  | 1.00/1.00  | 1.00/0.88 | 1.00/0.83 | 1.00/1.00 | 1.00/0.50 | 1.00/0.75 | 1.00/0.88   | 1.00/1.00   | 0.67/0.88 | 129      | 4     | 9,153 (3.3×)   |
| `names-v16a`  | 1.00/1.00  | 1.00/0.88 | 1.00/0.83 | 1.00/1.00 | 1.00/0.50 | 1.00/0.75 | 1.00/0.88   | 1.00/1.00   | 0.89/0.88 | 126      | 1     | 9,154 (3.3×)   |

Tokens are Jev input tokens. The ratio uses page bytes / 4 as the page's token count.

Precision on pages the variant had never seen:

| Variant      | Unseen pages           | Precision  |
| ------------ | ---------------------- | ---------- |
| `cards-v3c`  | fin.ai, devin.ai       | 0.50, 0.44 |
| `names-v8a`  | otter.ai, vapi.ai      | 0.40, 0.29 |
| `names-v13a` | bolt.new, chatbase.co  | 0.60, 0.78 |
| `names-v15a` | lovable.dev, fathom.ai | 1.00, 0.67 |

`names-v16a` fixes a code bug found on fathom.ai after that last holdout, so it has not been validated on unseen pages.

The stop criteria set for this goal were only partly met.

- **Met:** a precision floor of 1.00 on 8 of 9 pages.
- **Not met:**
  - Recall ≥ 0.90: vapi.ai is at 0.50 and bolt.new at 0.75, with most misses routed to review.
  - Fact extraction ≤ 2× page tokens: the average is 3.3×, dominated by question text.

## Recommended design

**State: one window per price literal, not the page.** For each money literal or price-state word, code sends:

- the literal itself;
- the unit and period terms read after it (same line, or the next short lines that start with `/`, `per`, `each`, `billed`…);
- about 12 lines before and 4 after, with images, link targets and HTML comments removed;
- a `starts_from` flag, and a flag when another price sits directly beside it.

Page context comes from the archived HTML, not the Markdown:

- the selected state of radios, tabs, switches and `aria-pressed` controls;
- vendor JSON-LD `Offer` names and currencies;
- any explicit currency statement such as "billed in USD only" or "Prices in USD".

Example state excerpt (cursor.com, current version):

```json
{
  "page": {
    "site": "cursor.com",
    "ui_state": ["Options \"Monthly\" (selected), \"Yearly\" (not selected)."]
  },
  "prices": {
    "p1": {
      "literal": "$20",
      "terms": "/ mo.",
      "starts_from": false,
      "before": [
        "Includes:",
        "- ✓ No credit card required",
        "…",
        "### Individual",
        "For the agent-curious"
      ],
      "after": ["ProPro+Ultra", "Everything in Hobby, plus:"]
    }
  },
  "names": {
    "n0": { "name": "For the tinkerer", "context": ["### Hobby", "For the tinkerer", "Free"] }
  }
}
```

**Questions: all independent, one request per page.**

- One `kind_<price>` Choice. The options are `plan_price`, `usage_price`, `outcome_price`, `credit_pack_price`, `addon_price`, `promotional_price`, `third_party_cost` and `none`, each with a one-line definition. Price-state words (`Free`, `Custom`, `Contact sales`, `Let's talk`) get `free_plan`, `custom_price` or `none`.
- One `name_<name>` yes/no per distinct plan-name candidate: "Is `names.nX.name` the name of a plan, tier, add-on or product offer?" The criteria carry generic examples (`'Starter'`, `'Team'`, `'Plans'`, `'Add-ons'`, `'For growing teams'`).

**Code rules (Jev never supplies values):**

- **Values:** amounts are parsed from the literal; evidence is the literal plus its same-line terms, verified against the capture.
- **Role and unit:** role = kind plus per-user wording in the terms (`seat_price` against `base_price`).
  - Usage and outcome denominators come from the terms, using the head noun (`per 1000 message credits` → 1000 credits).
  - A usage price denominated in credits becomes `credit_pack_price`, because production defines `usage_rate` as outside credits.
- **Period and commitment:** period comes from the terms; commitment comes from the selected billing control.
- **Currency:** the symbol gives the currency. A bare `$` is `DOLLAR_UNSPECIFIED` unless the page states USD. JSON-LD is kept as corroboration only.
- **Plan attribution** walks back from the price to the first heading or another price:
  - It takes the highest-scoring name inside that span.
  - A price inherits the plan of a price directly beside it only if no rejected name lies between them.
  - A name scoring between 0.3 and 0.7, or two passing names within 0.1 of each other, sends the fact to a **review** queue instead of guessing.
  - A vendor JSON-LD offer name wins when exactly one candidate matches it.
- **Exclusions:** promotional and third-party prices are excluded, together with any price on the same line. Ranges are skipped, and a price-state word directly above a price is treated as the plan name.
- **Deduplication:** restatements merge by plan, role, amount and unit, and singular and plural plan names are treated as one.
- **Thresholds**, calibrated on the labeled pages with a grid over cached answers: kind ≥ 0.6 was the lowest threshold with no wrong facts; plan names use the 0.3–0.7 band.

## What did not work

- **Whole-page state with id references (baseline).** Per-candidate confidence collapsed: offer names at 0.94 against 0.95, roles at 0.86 against 0.90. Unit questions like "is `$60 / mo.` flat?" scored 0.27, although code knows `base_price` implies `flat`.
- **Heading-based cards (`cards-v3c`).** Perfect on cursor.com, but 0.00–0.50 elsewhere. Many pricing pages have no Markdown headings per plan, and many put units on the next line.
- **A per-price Choice over noisy plan-name options.** It picked correct options at 0.08–0.55 confidence. A yes/no per name plus structural attribution in code replaced it.
- **Compact wording.** It saves 10–20% of tokens but drops recall, and once let a false "not a name" answer cross a card boundary.
- **Sibling inheritance without a guard.** One false-negative name produced two wrong facts. The "rejected name between" rule and the review band fixed this.

## Stability and versioning

- Jev resamples differently even for identical requests; TypeSafe documents a mean per-question standard deviation of about 0.01.
- Before noise removal (`names-v11`), noise-only captures (tracking pixels, cookie ids) produced different requests. Uncached runs then flipped borderline attributions: 6 of 9 devin.ai captures carried 1 wrong fact.
- After noise removal, identical content gives byte-identical requests. With a decision cache keyed by `sha256(model + request)`, unchanged content yields identical facts week to week. No-change weeks become free, and real changes stay visible: fin.ai `$19 → $ 29` was detected on every run.
- **Currency flips:** lovable.dev switched from € to £ between captures, with different amounts. Currency is part of fact identity, so the diff shows removed and added facts, never a price change.

## Capture gaps (for the capture roadmap)

- **Hidden states are in the Markdown.** Inactive tabs and panes (otter.ai monthly and annual, fathom.ai Individuals and Teams) and faded template values (fathom.ai `$34` under Enterprise) are all in the text, and only the HTML shows what is visible. Capture should record visibility and the selected state per element.
- **Some prices are missing from the Markdown entirely,** for example dub.co's animated or shadow-DOM numbers.
- **Rendering glues words and badges together:** `memberbilled`, `TeamsPopular`, `EnterpriseLet's talk`.
- **Comparison tables lose their column structure,** so a table cell's plan is unknown.
- **Consent panels:** CookieYes (fathom.ai) is not stripped.
- **Geo-localized currency** (lovable.dev) needs a pinned locale, or at least the capture context recorded.

## Limits

- Draft gold only; 9 pages and 22 captures. Most pages were used for tuning after their holdout run.
- Allowances, minimum seats, credit conversion and policies are not extracted. Inline sentence prices without a plan name (fin.ai "Fin Voice … custom pricing plan") are missed.
- vapi.ai recall is 0.50, mostly review items (`HIPAA compliance` against `Add-ons`) and a `$0 to start` classified as not a price.
- `names-v16a` was not validated on unseen pages.

## Promotion plan (requires approval)

1. **Coordinate first.** Another session has uncommitted edits in `apps/server/src/pricing/` (for example `pricing-facts.ts` and `source-candidates.ts`), and `docs/audits/2026-09-24-uncommitted-pricing-facts-review.md` reviews them.
2. **Port the code.** Move `state/page-context.ts`, `state/windows5.ts`, `state/names5.ts` and the `names-engine-v16.ts` rules into `apps/server/src/pricing/` behind `collectPricingFacts`. It must also take the archived HTML, which the scan already stores in R2.
3. **Extend the fact schema:** `free_plan` and `custom_price` roles, promotional and third-party exclusions, and review items with their reason. Bump `PRICING_FACTS_VERSION` to `pricing-facts-v2`.
4. **Add a decision cache:** store Jev answers by request hash per domain, in the PageStore Durable Object or R2, and reuse them for identical requests.
5. **Follow the fingerprint procedure** in `docs/pricing-methodology.md`:
   - add the new extraction files to the list in `apps/server/src/pricing/rubric.test.ts`;
   - update `FACT_EXTRACTION_FINGERPRINT` and `PRICING_RUBRIC_FINGERPRINT`, which gives a new rubric id.

   Old records stay historical and leave the current comparisons.

6. **Tests:** turn the approved gold into labeled fixtures for unit tests. Keep empirical accuracy runs in this lab.

## Next steps

1. **Review and approve the gold.** It is the only human checkpoint, and every number above depends on it.
2. **Label 10–20 more pages** with usage-heavy pricing, comparison tables and non-USD prices, and keep a fixed holdout set that is never tuned on.
3. **Capture visible text per UI state** from the DOM (selected tab, `display:none`, opacity, strike-through), so hidden panes and template values stop reaching extraction.
4. **Extend to allowances, minimum seats and policies** with the same pattern: window, one Choice, code-owned values.
