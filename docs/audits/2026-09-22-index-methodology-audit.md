# Pricing index methodology audit

Audit date: 22 September 2026. Scope: the current working tree, including existing local changes. Reviewed capture, rubric v5, publication, numeric extraction, benchmark aggregation, weekly comparisons, and their presentation. No production corpus or live Jev accuracy evaluation was used. No application code was changed by this audit.

The project can support a useful record of published AI pricing practices. Its present observations cannot establish buyer sentiment, willingness to pay, vendor margins, or whether a pricing strategy works. The primary improvement is to preserve more commercial facts per offer and compare a defined group over time. Adding a weighted quality score would not solve those measurement problems.

1. **What the implementation measures.**

The active code uses `pricing-intelligence-v5`. The README still describes an older five-dimension quality score. The present pipeline captures a pricing page, classifies its terms, keeps accepted answers, and aggregates them by category. It does not produce a weighted market sentiment score.

| Output | Current calculation | Supported interpretation |
| --- | --- | --- |
| Charging share | Stated / stated plus not established; uncertain answers excluded | Share of classified captured pages that state the charge |
| Policy distribution | Option count / accepted answers minus not applicable | Distribution among accepted answers, including not disclosed |
| Numeric benchmark | Median and range of each page's lowest accepted price, grouped by currency, commitment, and flat or seat unit | Distribution of observed entry prices in that group |
| Weekly commercial change | Pages with a verified commercial change / eligible paired pages | Frequency of detected policy-label changes; UI withholds the rate if any pair remains unresolved |

Code: [aggregation](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/benchmark.ts:114), [numeric benchmark](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/numeric-prices.ts:24), [weekly report](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/pricing-history.ts:124).

Several controls should remain: archived source, literal numeric extraction, confidence-based abstention, separate unknown and not-disclosed states, overlapping charging components, currency and commitment separation, and source checks for changed terms. The methodology already states many of its limits. This audit distinguishes those acknowledged scope limits from implementation defects.

2. **Public offers measure seller behavior. Buyer sentiment needs buyer evidence.**

A posted price is an offer. It is not evidence that customers buy at that price. A higher price could reflect higher compute costs, a new target segment, stronger demand, or a packaging change. The page alone cannot distinguish these explanations.

Use three separate research questions:

| Research question | Evidence needed |
| --- | --- |
| How do suppliers charge, and what changed? | Archived offers, billing terms, and comparable numeric facts |
| How do buyers feel about those terms? | Buyer interviews, surveys, or separately labeled public buyer comments |
| What do buyers accept and use? | Purchases, renewals, usage, switching, or transaction evidence |

For a buyer sentiment study, record the speaker role, product, topic, date, exact quote, and research source. Separate affordability, perceived value, predictability, and fairness. Keep vendor claims separate from buyer statements. Repeated comments from one author or one incident must not become independent buyers. Public comments can support a report about those comments; they do not automatically describe all customers.

3. **The current change detector loses changes within a label. High priority.**

`changeCandidates` skips a practice when its accepted label is unchanged. The verifier then returns `reviewed` when there are no candidates and no unresolved labels. This loses changes such as:

| Before | After | Same stored classification |
| --- | --- | --- |
| Purchased credits expire after 12 months | Expire after 3 months | `expires` |
| One credit per run | Ten credits per run | `all_described_uses` |
| Rollover limited to 6 months | Limited to 1 month | `limited_rollover` |

A temporary probe reproduced the expiry case. The result was `reviewed`, with no changes and no call to the verifier. Numeric price changes are also outside the weekly observation type and report. These are material limits for a market-change product.

Store the amount, duration, unit, condition, and offer identity beside each label. Generate change candidates from these facts. Track additions, removals, and replacements of offers. Preserve the current evidence checks after candidate detection.

All charging-signal transitions are currently forced to `disclosure`. That is a conservative rule for missing mentions, but it also prevents a commercial classification when both sources explicitly establish a switch in charging method. Permit that classification only after a same-offer comparison proves it.

Code: [candidate detection](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/change-verification.ts:53), [no-candidate result](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/change-verification.ts:177), [charging transitions](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/change-verification.ts:88), [weekly observation shape](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/pricing-history.ts:17).

4. **Measure an offer and its conditions before summarizing the product. High priority.**

The rubric asks about all public offers on a page. A seat charge could belong to the team plan, while credits belong to the individual plan. A product-level record cannot safely combine these into one bill. `varies_by_offer` preserves ambiguity but loses the commercially useful detail.

The numeric collector keeps four baseline slots and sets `plan` to null. It explicitly excludes standalone pay-as-you-go and add-on prices. That is valid for subscription entry-price research, but incomplete for AI pricing research. Direct usage, outcome charges, model rates, and AI add-ons need their own offer components.

The profile taxonomy also mixes different dimensions. `primary_pricing_model` asks one choice to distinguish a fixed subscription, seats, feature tiers, and hybrid pricing. These can coexist. `ai_cost_passthrough` cannot establish cost pass-through without vendor cost data, and its single-choice options do not cover combinations well. Prefer `charging_components`, `billing_unit`, `packaging`, and `commitment`. Keep the existing overlapping charging signals as product-level summaries derived from the detailed records.

Code: [scope](/Users/jhonsfran/repos/usepricelog.com/packages/db/src/pricing-intelligence.ts:383), [profile taxonomy](/Users/jhonsfran/repos/usepricelog.com/packages/db/src/pricing-intelligence.ts:24), [numeric exclusions](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/numeric-prices.ts:92), [baseline selection](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/numeric-prices.ts:168), [missing plan identity](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/numeric-prices.ts:312).

5. **Changing coverage can look like changing market behavior. High priority.**

A second probe held 40 stated pages constant. With 20 not-established and 40 uncertain pages, the classified share was 40/60, or 66.7%. Resolving the 40 uncertain pages as not established changed the share to 40/100, or 40%. The calculation is correct for its denominator. Treating the movement as adoption change would be incorrect.

Publish the positive count, full eligible count, uncertain count, and classified share together. For disclosure reporting, also show positive / all eligible captures. Label that as a confirmed disclosure share, with unresolved observations visible. Do not silently treat uncertainty as an observed negative. For trends, report transitions on the same eligible pages with comparable measurement in both periods.

`pricingPolicyCoverage` computes `applicable = classified - notApplicable`. Because `not_disclosed` remains included, a set of ten not-disclosed answers produces ten applicable pages. The rubric requires explicit evidence for not applicable, so unknown applicability can receive this misleading label. Add a separate applicability state. Report a credit-policy distribution among offers known to use the relevant credit type, with applicability unknown counted separately.

Code: [charging denominator](/Users/jhonsfran/repos/usepricelog.com/apps/web/src/routes/benchmarks.tsx:119), [policy coverage](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/pricing-intelligence.ts:66).

6. **Define the population and keep the historical sample identifiable. High priority.**

The corpus contains active, successfully published pages for the current rubric. Pages enter through user submission. There is no documented sampling frame in the reviewed collection path. One normalized domain is one page record; that is not always one product or one vendor.

The benchmark corpus query does not restrict capture age or model version. It can mix old successful captures with recent ones and multiple evaluator versions. Weekly comparisons do check exact model and rubric compatibility, which should remain. That control does not apply to current aggregate snapshots.

Define an explicit tracked universe, initially one or two categories. Give products stable IDs separate from source URLs. Record discovery source, inclusion reason, status, failed scans, and observation age. For a weekly product, a 14-day freshness limit is a possible starting policy, not a statistical rule. Publish how many records it excludes and test sensitivity to that choice.

Use an open directory for discovery and a documented panel for trends. Keep entrants, exits, category changes, stale records, and missing captures separate. Record the exact run IDs and calculation version behind each snapshot. A fixed panel improves comparability but can become unrepresentative as products enter or exit; review membership on a declared schedule and disclose the changes.

Sample thresholds of ten classified pages and three comparable prices are display policies. They do not establish representativeness. For inferred population claims, selection assumptions matter as well as sample size. [AAPOR disclosure standards](https://aapor.org/standards-and-ethics/disclosure-standards/) require non-probability precision claims to state their model and assumptions.

Code: [submission](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/routers/pages.ts:104), [corpus selection](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/benchmark-store.ts:23), [price reporting floor](/Users/jhonsfran/repos/usepricelog.com/packages/api/src/numeric-prices.ts:10).

7. **Make measurement versions immutable and validate the evaluator. High priority.**

`seedRubric` updates instructions and criteria under an existing rubric ID. If question text changes without an ID change, old and new observations can appear compatible even though the measurement changed. Store an immutable rubric hash covering scope, questions, criteria, and publication rules. Also version capture, extraction, and aggregation rules. Re-evaluate archived sources during a version change to estimate the effect of the new method.

The project states that model accuracy has not been established on a held-out human-labeled dataset. Its tests verify parsing and business logic, not real-world extraction quality. Jev returns probabilities and confidence, but these are distinct response fields. Do not interpret the Choice confidence threshold as an empirical accuracy rate for this project. [Cloudflare's Jev documentation](https://developers.cloudflare.com/ai/models/typesafe/jev/) shows the separate fields.

Start with a manageable human-reviewed pilot, such as 50 pages across two categories. This is a workload suggestion, not proof of sufficient sample size. Include multi-offer pages, missing disclosures, currency variants, and known historical changes. Use two reviewers for ambiguous definitions, then resolve disagreement. Hold out vendors and later dates from rubric tuning.

Measure per-field precision, recall, abstention, exact numeric and unit accuracy, and change-detection recall. Evaluate probability calibration separately. Include unchanged pages and within-label changes. A second check by the same model is useful, but its errors can correlate with the first check. It does not replace human evaluation.

Code: [mutable rubric](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/page-store.ts:444), [publication thresholds](/Users/jhonsfran/repos/usepricelog.com/apps/server/src/pricing/evaluation.ts:23).

8. **A more useful record joins qualitative evidence and quantitative terms.**

| Record | Minimum useful fields |
| --- | --- |
| Product and offer | Stable product ID, offer ID, audience, category, region, currency, commitment |
| Charge | Base fee, seat rate, minimum seats, usage or outcome unit, rate schedule, mandatory add-ons |
| Entitlement | Included quantity, reset period, pool scope, model or capability, credit-to-work conversion |
| Policy | Failure charging, exhaustion behavior, hard cap, expiry duration, rollover limit, exceptions |
| Evidence | Literal excerpt, source URL and offsets, capture hash, captured time, explicit effective date if available |
| Observation status | Stated, not disclosed, ambiguous, not applicable, source unavailable; applicability separately recorded |
| Evaluation | Rubric hash, model version, extraction version, raw probabilities, human review status |

Store one claim per row or structured fact. The qualitative explanation should summarize linked evidence. It should not introduce an unsupported vendor motive. Category and product identity can use separately cited official product sources; pricing claims should retain their exact source scope.

Capture monthly and annual states, relevant regions, and linked billing documents when needed. Record which states and documents were checked. Preserve separate measures for disclosure on the pricing page and terms found elsewhere. More sources improve coverage but increase capture cost and the risk of combining incompatible contexts.

9. **Compare the cost of a defined workload.**

An entry fee is one part of the customer's bill. For a simple linear offer with compatible units, an illustrative calculation is:

`cost = base_fee + seat_rate × max(seats, minimum_seats) + overage_rate × max(0, usage - included_usage) + required_addons`

This formula does not cover tiered rates, prepaid blocks, seat-pooled allowances, or model-dependent credits. Represent those rules explicitly. Do not fill unknown terms with zero. Compare credits only after a supported conversion into the same work unit.

For example, an unchanged USD 20 plan can rise to USD 30 for a workload of 100 units if its allowance falls from 100 to 50 and each excess unit costs USD 0.20. The entry-price statistic stays unchanged while that workload costs 50% more. This example is hypothetical.

First report the median change in cost for matched offers within each category, plus counts of increases, decreases, unchanged, replaced, and unresolved offers. Fix the workload, region, commitment, and required capabilities. Separate price changes from changes in product capability. Official price-index methods also treat product replacement and quality changes explicitly. [BLS calculation methodology](https://www.bls.gov/opub/hom/cpi/calculation.htm).

If a base-100 series is later useful, one option for positive, comparable costs is `I_t = 100 × exp(sum(w_i × log(C_i,t / C_i,0)))`. Declare the base panel and weights. Equal product weights describe tracked suppliers, not customer spending. Set a missing-observation and replacement policy before publication. Do not silently change the panel when a price is unavailable.

10. **Do not combine these measures into a general pricing-quality score yet.**

Charging method, price level, buyer control, and disclosure measure different things. A hard cap reduces bill risk but can stop useful work. Outcome billing can align payment with a result but creates questions about attribution and disputes. A low subscription fee can accompany costly overages. There is no universal direction that makes all these terms better.

Publish separate indicators for charging structure, workload cost, commercial policies, disclosure coverage, and buyer sentiment when buyer evidence exists. If a composite score later serves a defined decision, publish its objective, weights, missing-data treatment, and sensitivity analysis. The [OECD/JRC composite-indicator handbook](https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html) provides the methodological basis for checking these choices.

The recommended order is to define the tracked population, preserve offer-level evidence, make versions immutable, validate extraction, then publish matched trends. Add buyer research as a separate study if sentiment remains a product goal. Start with fewer categories and complete terms; wider coverage can follow once the measures are reliable.

Validation completed: 103 server tests and 53 API tests passed across 14 focused test files. Three temporary audit probes also passed and confirmed the expiry, denominator, and applicability behaviors described above. The probes were removed after execution. These checks do not measure live capture completeness or Jev accuracy on the production corpus.
