# Positioning: Pricelog

This document states where Pricelog competes, what it refuses to be, and how it
relates to unprice.dev. It sits alongside `target-customer.md`, which defines who
the product serves.

## The one-line position

**Pricelog is the public record of how AI companies actually price, updated weekly.**

Not a directory. Not a grader. A record of change. The closest analogues are the
State of JS survey, Ramp's spending index, and Carta's cap table data: an index
that works as a media property, where the dataset is the marketing and the
software is downstream.

## Positions we reject

| Position                                 | Why not                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing page gallery or inspiration site | Competes on screenshots. Screenshots are cheap. It wastes an evaluation engine, earns traffic with no willingness to pay, and creates no pull toward unprice.                |
| Competitive price monitoring             | A real category, but dominated by e-commerce SKU tracking. The B2B version sells top-down to organisations large enough to employ a pricing team. Wrong motion, wrong buyer. |
| One-shot pricing grader                  | Website-grader mechanics generate a share and never a return visit. It wastes the weekly scan cadence, which is the only thing competitors cannot copy.                      |

## Why this position and not another

1. **We already hold the only taxonomy that matters.** The `is_ai_native`,
   `offers_copilot`, `offers_autonomous_agent`, `offers_agent_platform`, and
   `offers_agent_workforce` signals are a genuinely novel segmentation. Generic
   pricing datasets are blind to it.
2. **The industry is mid-transition and there is no reference data.** Software is
   moving from per-seat to usage and outcome pricing because of agents. Every
   founder shipping an AI product is asking how to price one, and the honest
   answer today is "nobody knows yet." Pricelog can answer it with evidence.
3. **Time series cannot be copied.** A competitor can scrape the same pages
   tomorrow. They cannot have last year's. This is the entire moat, and it
   compounds from the first scan.

## Sequencing

1. **Lead with the AI pricing benchmark.** Aggregate distributions across the
   AI-native segment. This is the artifact people link to.
2. **Compound with the change log.** "Who changed their pricing this week, and
   what changed." Near-zero marginal cost once versions exist, inherently
   newsworthy, and the reason to return.
3. **Monetise with the owner dashboard.** Benchmark your own page against your
   category. Only works once the first two have created an audience.

The per-page directory is the search base, not the pitch.

### Backfill is worth buying

The time series is worth far more starting eighteen months ago than starting
today, and Wayback Machine snapshots are the only way to buy that history for the
top few hundred pages. This is the highest-leverage one-off task available.

## The aggregate screen

The directory remains the search front door. The `/benchmarks` route is the
aggregate report. It shows distributions, medians, and cohort shares. The next
step is to add period-over-period changes after enough scheduled snapshots exist.
The implementation record is in
`docs/superpowers/plans/2026-09-20-pricing-benchmark-index.md`.

## What makes the questions valuable

Three tests every question must pass before it appears in the interface:

1. **Does the answer change what a founder does on Monday?** If not it is a
   filter, not an insight. The `market_*` signals are filters. Correct to
   collect, wrong to display as findings.
2. **Can the answer be wrong in an interesting way?** `market_hr` surprises
   nobody. A finding that most agent products publish no customer-controlled
   spend cap is a result.
3. **Is the distribution more interesting than the instance?** The best questions
   are the ones where the aggregate is the product.

And the presentation rule that turns data into value:

> **No number ships without its peer distribution.**

Not "Cost predictability: 62" but "62, 31st percentile among 84 AI developer
tools, median 74." A score with no comparison class is a number without meaning.
Every weak score must then name the specific missing artifact: not "packaging is
unclear" but "no plan states a numeric limit, most of your peers state at least
one."

## Relationship to unprice.dev

Pricelog is a demonstration artifact for unprice.dev, but the bridge is not a
logo. It is that Pricelog names a **specific implementation gap** and unprice is
the mechanism that closes it.

| Pricelog finding                                 | Implementation problem                   | unprice surface    |
| ------------------------------------------------ | ---------------------------------------- | ------------------ |
| Usage-based model, no `has_spend_cap`            | Customers cannot cap runaway agent spend | Budget reservation |
| `credits_expire`                                 | Credit ledger with expiry                | Usage recording    |
| Six or more plans, no `publishes_numeric_limits` | Entitlement enforcement                  | `can()`            |
| `value_metric: action_or_run`                    | Metering per agent action                | Usage recording    |

Each row is an engineering problem the founder now knows they have, because the
report told them. That is a stronger hand-off than a banner.

The strongest single move is to **meter Pricelog's own owner dashboard with
unprice and publish the source**. Scan quota, plan limits, the whole path. A
working, non-trivial, public application running on the SDK outargues any landing
page.

## Methodology and the reputational surface

Publishing numeric quality scores about named companies will eventually draw an
objection. The defence is method, published in public:

- A methodology page rendered from the same shared catalog the model reads, so
  the published question and the evaluated question cannot differ.
- Model confidence shown next to every answer. It is already stored.
- The capture timestamp and archived snapshot each score was derived from.
- A stated correction path.

One honest limitation that belongs on that page: Pricelog measures **what a
pricing page states**, not what a product does. A missing spend cap signal means
the page does not establish one. It does not mean the feature is absent. Every
aggregate claim must be phrased as a claim about disclosure.

Get counsel on the framing before scaling this. Do not rely on an internal read.

## Out of scope for this position

- Recommending a price. Pricelog reports the market, it does not set it.
- Private or contract pricing. Public pages only.
- Consumer or retail price comparison.
