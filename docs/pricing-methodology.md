# Pricing methodology

Pricelog records stated terms from public pricing pages that users submit. It does not measure the whole market, buyer sentiment, conversion, margins, or pricing quality.

## Capture

Chromium renders the page through Browser Run. The capture dismisses known cookie panels, records the visible text of the page, clicks billing toggles, tabs and sliders, and records what each one changes. It archives the screenshot, the HTML and that page text in R2. Prices the page declares as schema.org data (Offer, AggregateOffer) are appended to the page text as a `structured data` section. Linked documents are outside its scope.

## Scan pipeline

`queued → capture → archive → draft → verify → project → store → publish → complete`

| Phase     | Stage     | Output                                                                   |
| --------- | --------- | ------------------------------------------------------------------------ |
| Extract   | `capture` | One rendered Chromium snapshot                                           |
| Extract   | `archive` | HTML, screenshot, and Markdown in R2; capture manifest in the page store |
| Transform | `draft`   | Price and feature quotes proposed by the extraction model                |
| Transform | `verify`  | Grounding in code, then one Jev question per price and per feature row   |
| Transform | `project` | Public facts supported by Jev, plus owner review items                   |
| Load      | `store`   | Answers and evaluation stored with the captured version                  |
| Load      | `publish` | Publication prepared in the page store, then delivered to D1             |

`complete` means the page store has committed a successful version. The D1 directory update can finish later because the page store retries pending publication. If the price extraction fails, `verify` skips Jev; `project` creates an unavailable snapshot, and the scan still stores and publishes its capture. Older runs can show the former `persist` or `evaluate` stage names.

Each run has a durable pipeline trace in the owner view. It records stage transitions, capture size and browser time, extraction warnings, provider status, Jev answer count, selected fact count, and the final error. The trace stays with the run if a Workflow step retries or the directory update is delayed. Use the captured HTML and Markdown links to inspect the exact input when a draft fails.

## Extraction and verification

The extraction model copies prices and features from the archived page text in two requests. The prices request asks for every price with its plan (or none, for prices that apply to all plans), the exact line, and a proposed period, billing term and kind (flat, per seat, usage, add-on, free or custom quote). Llama 3.3 70B answers first and Qwen3 30B answers if Llama fails. The features request asks for each feature with its value per plan; Qwen answers first and Llama is the fallback. A proposal is not evidence.

Code checks two things: every quoted plan, price line, feature name and value must appear in the page text, and every proposed period, billing term and kind must be one of the allowed values. A failed check becomes an `ungrounded` or `invalid` review item.

Jev receives the same page text and answers:

| Question         | Type   | Publishes when              |
| ---------------- | ------ | --------------------------- |
| Each price       | Yes/no | Probability at least `0.80` |
| Each feature row | Yes/no | Probability at least `0.80` |
| Product category | Choice | Confidence at least `0.75`  |
| Free trial       | Yes/no | Stored as a probability     |

A price question asks whether the page offers the plan at the quoted price, for the proposed period and billing term, as the proposed kind. A feature question asks whether the page states the quoted values for that feature. Below `0.80` a claim goes to review as `uncertain`, and at or below `0.20` as `rejected`.

Every other profile field is derived in code from the published prices and features: free plan, contact sales, numeric limits, fixed subscription, per-seat, usage, credit and add-on charges, and price disclosure. Jev is not asked about them.

The public directory shows only accepted claims. The owner view lists every claim that did not publish, with its reason. Raw extraction output and Jev answers stay with the captured version in its Durable Object.

## Scope and versions

The rubric is version 12 and the commercial snapshot is `pricing-snapshot-v4`. Earlier captures remain historical under their original rubric and snapshot version.

Current comparisons require an active page, the current rubric, exact Jev model version `jev-1.13.0`, and a capture from the last 14 days. The time limit does not establish that a vendor kept its terms unchanged.

Acceptance thresholds are rules, not measured accuracy claims. Tests with scripted answers check the pipeline, not model accuracy on live pages.
