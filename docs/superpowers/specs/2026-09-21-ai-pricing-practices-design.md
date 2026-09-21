# AI pricing practices benchmark

## Product decision

Pricelog is a public weekly record of how AI products charge customers. It helps founders and product teams compare charging rules before launching or revising paid AI usage. Unprice provides an implementation path for credits, customer budgets, and usage charges.

The benchmark contains independent measures. It does not rank pricing quality, infer commercial success, or prescribe a price. Public pricing terms cannot establish customer willingness to pay, actual margins, or conversion performance.

This specification records the direction approved in the conversation. The owner authorized implementation on 2026-09-21.

## Release scope

- Charging structure: identify each published charging component independently.
- Commercial terms: credit conversion, allowance behavior, customer spend limits, failed-run policies, and credit expiry.
- Weekly changes: report only changes with comparable captures and supporting evidence.
- Categories: support multiple categories as the owner adds pricing pages. No seeded companies or invented observations.
- Prices: defer exact price statistics and price bands until a labeled evaluation establishes a reliable collection method. Do not derive currency values from Jev Score outputs.

Watchlists, billing integration, automated price recommendations, and customer-spend simulations are outside this release.

## Observation scope

The existing collector captures one pricing URL per normalized domain. The first benchmark therefore measures pricing pages, not individual plans or all products sold by a company. Name that unit in the interface and methodology.

Every question uses the same captured source. Questions about charging components ask whether any public offer on that page uses the component. Results can overlap. Questions about policies allow a `varies_by_offer` answer when the page establishes different policies for different offers. Do not silently choose the first plan or infer the most popular plan.

Exclude navigation, testimonials, competitor references, and hypothetical examples from evidence of a commercial term. Explicitly stated terms in the page's FAQ are eligible. Linked documents that have not been captured are outside the source scope. A truncated or unusable capture must not create a negative disclosure finding.

## Category behavior

Keep category definitions in a shared catalog and classify with Jev. Add category definitions without rewriting aggregation or route components. Existing broad market tags remain discovery filters. Narrow use-case categories are the comparison groups.

Initial definitions cover coding assistants, customer-support agents, workflow and agent builders, and model APIs. Include `other` and `not_disclosed` classification outcomes. The owner can add pages from any category later. Category membership is a model classification, not evidence of equal quality or interchangeable outputs.

Show category counts even when a category is too small for aggregate statistics. Provide its observed pages and an explanation of the minimum sample rule. Do not replace a requested category with all pages. The all-pages view is an overview and is not a peer price comparison.

## Question design

Use Choice for explicit policy states. Use Noul for narrowly scoped presence checks whose false condition means the source does not establish the statement. Preserve uncertainty separately. No new question asks Jev to count, calculate, infer profitability, or estimate a price.

### Charging components

Ask one Noul question for each component:

- Does at least one paid offer require a fixed recurring fee for access?
- Does at least one paid offer calculate a charge using the number of customer seats?
- Does AI activity consume a credit balance in at least one offer?
- Does at least one offer charge directly for measured AI consumption outside a credit balance?
- Does at least one offer charge for a stated business outcome?
- Does access to AI functionality require a separately purchased add-on in at least one offer?

Credits are a billing representation and can coexist with subscriptions, seats, and usage. Their shares must not be presented as mutually exclusive market shares.

### Commercial terms

| Question                                                             | Choice criteria                                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the page state how credits convert into a named action?         | Stated for all described credit uses; stated for some; explicitly variable without a conversion; not disclosed; not applicable                                 |
| Does model selection change the credits consumed?                    | Explicitly yes; explicitly no; varies by offer; not disclosed; not applicable                                                                                  |
| What happens by default when included usage is exhausted?            | Work stops; work is throttled; overage charges continue; credits refill automatically; varies by offer; another stated behavior; not disclosed; not applicable |
| Can the customer set a maximum charge that stops further paid usage? | Explicitly available; explicitly unavailable; varies by offer; not disclosed; not applicable                                                                   |
| What charging policy applies to failed runs?                         | Charged; not charged; conditional; varies by offer; not disclosed; not applicable                                                                              |
| What expiry policy applies to purchased credits?                     | Expire; do not expire; varies by offer; not disclosed; not applicable                                                                                          |
| What expiry policy applies to included credits?                      | Expire without rollover; roll over with stated conditions; roll over without stated conditions; varies by offer; not disclosed; not applicable                 |

Every criterion needs literal boundary examples in the shared catalog. An alert is not a hard cap. A provider-cost budget is not a customer charge limit. A trial allowance is not evidence of the policy for paid usage. Failed runs and completed outcomes require separate questions. Rollover alone does not establish that credits never expire.

## Measurement and publication

Retain raw answer probabilities and the provider model version. The published rubric and the evaluated rubric must use the same catalog.

For each Choice question, show the distribution of accepted answers, including `not_disclosed`. Show uncertain answers separately. Exclude `not_applicable` from policy comparisons and display its count. Report the number of applicable, classified, uncertain, and excluded pages so the denominator can be reconstructed.

For Noul disclosure questions, show confirmed positive observations and unresolved observations. A low probability for a disclosure statement must not become a claim that the product lacks the feature. Thresholds are publication rules, not measured accuracy claims.

The existing minimum of ten pages is an operational display rule. It is not proof of representative sampling or statistical significance. Apply the minimum to the relevant metric denominator as well as the category. Show counts instead of headline percentages when the denominator is too small.

No overall quality score appears in the benchmark or directory. Obsolete scoring code and columns are removed. Page versions, raw answers, evaluations, provider models, and weekly comparisons belong to each page Durable Object. D1 holds the directory, latest index projections, and global metrics. R2 holds large captured artifacts referenced by DO version records. A new rubric identity requires new evaluations before those pages enter the new benchmark.

## Weekly changes

Use fixed UTC weeks. A page contributes at most one latest successful capture per week. A comparison requires successful captures in adjacent completed weeks, compatible rubric versions, and compatible model versions. Report paired coverage, new entrants, and missing observations separately.

A change in a Jev answer is a candidate change only. Changed source content and sufficient evidence must support publication. Unchanged source hashes cannot produce a commercial change. Missing information becoming explicit is labeled a disclosure change, not proof that a new capability was introduced.

Use Jev questions against labeled before and after source blocks. Select evidence by supplied block identifiers, with a separate check that supporting evidence exists. Code resolves the selected identifiers to literal archived text. Reject identifiers outside the candidate list and suppress contradictory or uncertain comparisons.

Public records link both dated captures and include the literal before and after evidence. Render report text from templates and accepted classifications. Do not use a generative model to explain causes or motives.

The weekly change rate is the number of distinct pages with at least one verified commercial change divided by the number of eligible paired pages. Multiple changes on one page count once. Do not calculate this rate from independently aggregated weekly shares.

When there are no eligible comparisons, show that history is being collected. Do not display a zero change rate or fabricate a first report.

## Interface

The index leads with its category selector, observation period, page count, and coverage. It groups metrics by charging structure and commercial terms. Each metric exposes its question, answer definitions, denominator, and source examples.

The weekly section shows evidence-backed changes when available. Its empty state states which comparison data is missing. The directory links to the benchmark and shows category or charging information in place of a quality ranking. Public profiles show terms and evidence.

Use the existing visual system and shared UI controls. Add an explicit Unprice attribution and a relevant documentation link near the implementation context. Do not label a company as needing Unprice because a term is not disclosed.

## Validation

Before claiming model accuracy, evaluate a human-labeled set that includes mixed plans, absent terms, explicit negatives, unrelated budget references, expired credits, different rollover rules, and unchanged captures. Keep tuning and evaluation examples separate.

Functional checks cover denominator reconstruction, overlapping charging components, category expansion, rubric compatibility, duplicate captures, unknown answers, missing captures, idempotent persistence, and evidence validation. UI checks cover empty categories, insufficient metric coverage, populated categories, archived sources, and unavailable weekly comparisons.

## Research references

- TypeSafe primitives: https://docs.typesafe.ai/introduction
- Jev 1.13 numerical and reasoning limits: https://docs.typesafe.ai/model-jaggedness/jev-1.13
- Evidence selection using line identifiers: https://docs.typesafe.ai/cookbooks/semantic_find
- Confidence definition: https://docs.typesafe.ai/confidence
- Salesforce Ventures pricing survey: https://salesforceventures.com/perspectives/ai-pricing-what-the-data-says/
- Bessemer founder accounts: https://www.bvp.com/atlas/durable-monetization-how-four-ai-founders-solved-the-pricing-puzzle
