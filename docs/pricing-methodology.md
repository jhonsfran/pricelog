# Pricing methodology

Pricelog records facts from submitted public pricing pages. The sample is not a market census. Published terms do not establish buyer sentiment, willingness to pay, conversion performance, margins, or pricing quality.

## Capture and source

Chromium captures one rendered page. Rendered Markdown is the evidence source for collection and change checks. HTML and screenshots remain archived for capture debugging. A capture can omit billing-toggle variants or content that requires interaction. Linked documents are outside the source scope.

Only Jev evaluates the source. Navigation, testimonials, competitor references, hypothetical examples, and instructions embedded in the source are excluded. Explicit pricing FAQ terms are eligible.

## What is collected

The page profile records product category, audience, buying motion, and price disclosure. Charging components are independent. Fixed subscription, seats, credit wallets, direct usage, outcome charges, and AI add-ons can occur together.

For each accepted offer, the collector can record:

- Base prices and seat prices.
- Usage, outcome, and overage rates.
- Credit pack and AI add-on prices.
- Included allowances and credit-to-work conversion.
- Purchased credit expiry and included credit rollover limits.
- Minimum paid seats.

The seven policies cover credit conversion, credit use by model, allowance exhaustion, customer spend caps, failed runs, purchased credit expiry, and included credit rollover. The collector keeps offer-specific answers so different offers need not share one policy.

There is no primary pricing-model label, inferred value metric, expansion-path label, or AI cost pass-through classification.

## Acceptance rules

Code finds bounded numeric and offer-name candidates. Jev Choice questions select or classify candidates. Code copies selected source values and retains their literal evidence spans. Jev does not generate prices, calculate minimums, or supply money amounts through scores.

Offer fact choices require at least `0.90` confidence. Independent Noul checks require at least `0.95` probability. The model must identify itself as exactly `jev-1.13.0`. These are acceptance rules, not calibrated accuracy claims.

Page-profile Choice answers use the shared catalog threshold, currently `0.75`. Charging disclosures are stated at `0.80` or above, not established at `0.20` or below, and uncertain between those values. Raw probabilities remain stored.

Positive facts need literal evidence. Missing disclosure requires evaluation of the complete captured source. An excerpt cannot establish that a policy is absent elsewhere. Not applicable requires explicit evidence that the policy cannot apply. Ambiguous or conflicting evidence remains uncertain.

Request and candidate limits bound collection. A limit failure marks collection unavailable. The UI distinguishes not collected, unavailable, and collected with no accepted facts. Unresolved numeric and policy counts remain visible.

## Numeric limits

The parser accepts supported decimal literals with a dot decimal separator and optional comma thousands grouping. Code expands explicit thousand, million, and billion scale words with exact decimal arithmetic, including rate quantities such as per million tokens. It rejects ambiguous grouping, decimal commas, percentage fragments, scientific notation, shorthand scales such as K or M, and unsupported precision. Unsupported formats remain uncollected and count as unresolved numeric candidates.

A bare `$` does not establish USD. Such prices remain visible with an unspecified currency and are excluded from numeric statistics. Unknown quantity does not mean one. Unknown allowance does not mean zero or unlimited. Credits from different vendors are not equivalent.

The published-price table projects all accepted positive recurring base and seat prices. Baseline comparisons exclude promotional, crossed-out, competitor, add-on, and one-time prices. Included usage and overage must belong to the same offer and billing commitment.

## Current comparisons

Current comparisons and their linked directory lists use the same eligibility rules:

- The page is active.
- The capture uses the current rubric and exactly `jev-1.13.0`.
- The capture is at most 14 days old and is not in the future.

The 14-day window is a collection policy. It is not evidence that a vendor has kept its price unchanged. Older and incompatible records remain on their profile pages with an exclusion notice.

Charging and policy percentages use all eligible pages in the selected sample. Not disclosed, not applicable, and uncertain answers remain visible. Charging components overlap, so their percentages can total more than 100%.

Price statistics require a product category and compatible currency, billing commitment, and charging unit. Each product contributes at most one baseline price to a group. Code selects that minimum from accepted offers. Annual totals can be divided by twelve for a labeled monthly equivalent, while annual commitment remains explicit. Counts below the configured sample minimum do not produce medians and ranges.

These statistics describe the tracked sample. They are not a total-bill estimate or a recommendation about the best pricing model.

## Weekly changes

Weekly reports compare the latest successful captures from adjacent completed UTC weeks. Paired captures must use the same rubric and the accepted exact model.

Code compares numeric facts with the same literal offer identity, fact role, currency, unit, billing commitment, period, and rate quantity unit. Numeric changes are detectable even when page-level labels remain equal. Independent Jev evidence checks then verify that the source supports the same-offer change under the same conditions.

Renamed offers, duplicate identities, unmatched terms, and unknown attribution remain unresolved. Equal values with changed evidence also remain unresolved because allocation scope or other conditions can change without changing the amount. Additions or removals do not establish a commercial change by themselves. A newly stated term is a disclosure change. Identical source can be marked unchanged without a new model decision. Each published change links to literal evidence in both captures.

## Versions and evaluation

The rubric stores an immutable content fingerprint and pins the accepted model. A contract change requires a new rubric identity and new evaluation. Earlier records remain historical and cannot enter the current sample.

Unit tests use scripted Jev answers to verify parsing, attribution, persistence, and comparison rules. These tests do not measure Jev accuracy on real pricing pages. Measure that separately with human-reviewed examples before making accuracy claims.

The extraction fingerprint covers candidate parsing, Jev prompts and checks, and price projection. The rubric fingerprint also covers page questions, thresholds and the approved model. The rubric test fails after these files change. Update the extraction fingerprint from those source files, then update the rubric fingerprint to the test's computed value. Change comparison versions when verification semantics change. Stored question sets reject in-place edits under an existing identity.

Design references: [TypeSafe pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook), [state](https://docs.typesafe.ai/concepts/state), [Jev model limits](https://docs.typesafe.ai/models), and [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13). Keeping rendered Markdown is a project design choice, not a measured claim that Markdown always outperforms HTML.

## Rollout

Apply the generated D1 migration before deploying the new API, then capture pages with the new rubric. No old classification is relabeled as a new observation. The current index can be empty until these new scans finish. Both weekly observations must use compatible versions, so weekly comparisons also need two compatible captures. The migration has been generated and tested locally; production deployment and rescans are separate operations.
