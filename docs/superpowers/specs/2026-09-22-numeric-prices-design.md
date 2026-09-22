# Numeric pricing observations

The user approved adding entry price, seat price, included usage, and overage rates, followed by category medians and ranges for comparable offers. Fixed-usage simulations remain a later step.

Copy numeric literals from archived Markdown. Jev selects and validates candidate IDs using choice and noul questions. Do not use generative extraction or Jev score outputs as dollar values. Preserve literal source evidence and the exact model version. Require confident classifications and an independent evidence check. Ambiguous currency, billing, promotional prices, competitor examples, or incomplete source interpretation cannot enter numeric aggregates.

Collect up to four baseline offers per page: the lowest paid flat fee and per-seat rate, each for monthly and annual commitments. Keep price display period separate from commitment. Preserve original amounts as decimal strings. Store included usage and overage terms against the selected offer only. Do not equate vendor credits or invent allowances. Unknown is distinct from zero or unlimited.

Each successful scan stores optional numeric results in its DO evaluation JSON. D1 adds only a latest numeric summary and aggregate numeric groups. Existing observations remain immutable. Numeric evaluation failure records an unavailable result without discarding otherwise valid practice observations. Existing scans have no numeric result until rescanned.

Category comparisons group by currency, commitment, and flat/per-seat basis. Annual totals can be divided by twelve for an explicitly labeled monthly equivalent. One baseline observation per product per group. Show product count and source examples. Medians and min/max require at least three comparable products and are labeled sample statistics. Category-wide usage/overage averages are excluded because units and plan scope differ; show offer-specific values instead.

Numeric prices appear on public and owner page details and at the top of category comparisons. Keep a clear not-collected/unavailable state. The broad AI overview links users to categories instead of pooling unrelated prices. Document that the capture contains only visible published terms and may not expose all billing-toggle variants.

Validation covers decimal parsing, annual totals versus monthly display, currency separation, free/promotional exclusions, source evidence, uncertain Jev decisions, same-offer allowances/overage, provider failures, immutable version persistence, and live rescans. Use the existing source links. No remote deployment.

Bare dollar amounts can be displayed as DOLLAR_UNSPECIFIED. They never enter currency aggregates. A bounded audit retains parsed Jev decisions for each numeric phase with the captured evaluation in the owning Durable Object. D1 excludes this audit.

Question design follows [TypeSafe Noul guidance](https://docs.typesafe.ai/primitives/noul): separate conditions, concrete criteria, and compose acceptance in code. Publication thresholds remain policy rules, not measured extraction accuracy.

Final baseline policy: Choice confidence and semantic Noul checks require 0.90. Code verifies numeric literals and bare-dollar markers directly; those checks do not imply a currency denomination. Exact currencies also require a semantic currency check. Optional allowance and overage attribution retain 0.95. Confidence is the minimum actual required semantic result, not a joint accuracy estimate. The same-model verification pass is not independent statistical evidence.
