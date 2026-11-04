# Pricing methodology

Pricelog records stated terms from public pricing pages that users submit. It does not measure the whole market, buyer sentiment, conversion, margins, or pricing quality.

## Capture

Chromium renders the page through Browser Run. The capture dismisses known cookie panels, records the visible text of the page, clicks billing toggles, tabs and sliders, and records what each one changes. It archives the screenshot, the HTML and that page text in R2. Prices the page declares as schema.org data (Offer, AggregateOffer) are appended to the page text as a `structured data` section. Linked documents are outside its scope.

## Scan pipeline

`queued → capture → archive → draft → verify → project → store → publish → complete`

| Phase     | Stage     | Output                                                                 |
| --------- | --------- | ---------------------------------------------------------------------- |
| Extract   | `capture` | One rendered Chromium snapshot                                         |
| Extract   | `archive` | HTML, screenshot, and Markdown in R2; manifest in the active workspace |
| Transform | `draft`   | Price and feature quotes proposed by the extraction model              |
| Transform | `verify`  | Grounding in code, then one Jev question per price and per feature row |
| Transform | `project` | Public facts supported by Jev, plus owner review items                 |
| Load      | `store`   | Answers and evaluation prepared in the active workspace                |
| Load      | `publish` | Terminal run, capture, analysis, and public summary delivered to D1    |

`complete` means the page store has frozen the terminal run and its delivery record. D1 delivery can finish later because the page store retries pending archives from its alarm. D1 stores the run history, capture manifests, complete analyses, answers, and rubric documents. A successful archive and its public summary commit in one batch. Failed runs also enter D1 history, but their artifacts stay private. If the price extraction fails, `verify` skips Jev; `project` creates an unavailable snapshot, and the scan still stores and publishes its capture. Older runs can show the former `persist` or `evaluate` stage names.

Each run has a durable pipeline trace in the owner view. It records stage transitions, capture size and browser time, extraction warnings, provider status, Jev answer count, selected fact count, and the final error. The trace stays with the run if a Workflow step retries or the directory update is delayed. Use the captured HTML and Markdown links to inspect the exact input when a draft fails.

## Extraction and verification

The extraction model copies prices and features from the archived page text in two requests. The prices request asks for every price with its plan (or none, for prices that apply to all plans), the exact line, and the page state it appears under. Qwen3 30B answers first; Llama 3.3 70B answers when Qwen fails, returns no prices for a page that shows amounts, or repeats one line in a loop. The features request asks for each feature with its value per plan, with the same fallback. The model proposes no labels; Jev decides what each price is.

Code checks that every quoted plan, price line, feature name and value appears in the page text. A quote that does not becomes an `ungrounded` review item. The same price line for the same plan is checked once.

Jev receives the same page text and answers:

| Question                     | Type   | Publishes when                                     |
| ---------------------------- | ------ | -------------------------------------------------- |
| Each price                   | Choice | Confidence at least `0.5`, and not "not this plan" |
| Each feature row             | Yes/no | Probability at least `0.5`                         |
| Product category             | Choice | Confidence at least `0.75`, and not `unknown`      |
| When included usage runs out | Choice | Confidence at least `0.5`, and not `not_stated`    |
| Customer spend cap           | Choice | Confidence at least `0.5`, and not `not_stated`    |
| What is metered              | Choice | Confidence at least `0.5`, and not `none_stated`   |

A price question asks what the quoted amount is for its plan: a flat or per-seat price billed monthly or annually, a usage rate, an add-on, a free plan, a custom quote, or not this plan's price. The period comes from the quoted text. A price without an amount publishes only as a free or custom price whose text says so. A feature question asks whether the page states the quoted values for that feature. A price or feature row that does not publish goes to review with its reason. A monetization answer that does not publish is simply absent.

Every other profile field is derived in code from the published prices and features: free plan, contact sales, numeric limits, fixed subscription, per-seat, usage, credit and add-on charges, and price disclosure. Jev is not asked about them.

Monetization numbers are computed from the published facts and are shown only when the facts settle them:

- Annual discount per plan and its median, from plans with both a monthly-billed and an annual-billed price of the same kind.
- Entry price and price ladder, from each paid plan's monthly price or annual monthly equivalent, when all tiers share one currency.
- Included unit price, a plan's monthly price over the absolute quantity a feature row includes of the metered unit, per unit and per 1,000. Relative values such as `10x` or `Unlimited` are skipped.
- Overage markup, a usage rate per unit over the included unit price of its plan, or of the cheapest tier for rates that apply to all plans, when units and currency match.

The public directory shows only accepted claims. The owner view lists every claim that did not publish, with its reason. Raw extraction output, the numeric audit, the snapshot, review items, coverage, pipeline identity, model version, and exact Jev answers stay in one immutable analysis in D1.

## Scope and versions

The rubric is version 13 and the commercial snapshot is `pricing-snapshot-v4`. Each capture keeps its original run ID, capture time, R2 keys, and content hashes. A correction adds a new analysis of those saved bytes. It does not create a scan or change the capture time.

Appending an analysis and selecting it are separate operations. Selection checks the expected prior analysis ID. The selected analysis supplies public history and the latest summary when that capture is still the latest capture. Selecting an analysis of an older capture cannot replace a newer summary. Comparisons store the exact before and after analysis IDs, so a comparison of an older revision does not describe a newly selected revision.

Legacy history enters D1 through a bounded, resumable operator import. History routes return HTTP 503 until their page is ready. Weekly reports wait for every active page. The import retains the legacy DO rows and R2 objects. See [the D1 history runbook](./d1-history-runbook.md).

Current comparisons require an active page, the current rubric, exact Jev model version `jev-1.13.0`, and a capture from the last 14 days. The time limit does not establish that a vendor kept its terms unchanged.

Acceptance thresholds are rules, not measured accuracy claims. Tests with scripted answers check the pipeline, not model accuracy on live pages.
