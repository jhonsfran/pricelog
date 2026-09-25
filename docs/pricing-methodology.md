# Pricing methodology

Pricelog records stated terms from public pricing pages that users submit. It does not measure the whole market, buyer sentiment, conversion, margins, or pricing quality.

## Capture

Chromium captures one rendered page. The capture dismisses known cookie panels before serialization and archives full-page screenshot, HTML, and Markdown in R2. The accessibility tree can restore a literal price label that Markdown omitted from a rendered widget. The archived Markdown keeps that label. Linked documents and billing-toggle views that the capture did not open are outside its scope.

## Scan pipeline

`queued → capture → archive → draft → verify → project → store → publish → complete`

| Phase     | Stage     | Output                                                                   |
| --------- | --------- | ------------------------------------------------------------------------ |
| Extract   | `capture` | One rendered Chromium snapshot                                           |
| Extract   | `archive` | HTML, screenshot, and Markdown in R2; capture manifest in the page store |
| Transform | `draft`   | Validated proposals from bounded archived Markdown excerpts              |
| Transform | `verify`  | Jev answers about draft claims, using Markdown from the same capture     |
| Transform | `project` | Public facts supported by Jev, plus owner review items                   |
| Load      | `store`   | Answers and evaluation stored with the captured version                  |
| Load      | `publish` | Publication prepared in the page store, then delivered to D1             |

`complete` means the page store has committed a successful version. The D1 directory update can finish later because the page store retries pending publication. If the draft is invalid, `verify` skips Jev; `project` creates an unavailable snapshot, and the scan still stores and publishes its capture. Older runs can show the former `persist` or `evaluate` stage names.

Each run has a durable pipeline trace in the owner view. It records stage transitions, capture size and browser time, extraction warnings, provider status, Jev answer count, selected fact count, and the final error. The trace stays with the run if a Workflow step retries or the directory update is delayed. Use the captured HTML and Markdown links to inspect the exact input when a draft fails.

## Draft and verification

The draft uses archived Markdown from the capture. Browser Run `/json` calls `@cf/qwen/qwen3-30b-a3b-fp8` through the Browser binding with a separate schema for page profile, flags, offers, and features. Profile, flags, and offers use the first 10 KiB of pricing content. Feature extraction covers the source in requests of at most 6 KiB each. The source has a 72 KiB limit, equal to Jev's source limit. Each part must pass local schema validation. If a Qwen request fails, times out, or returns invalid JSON, Workers AI calls Llama 3.3 70B for that part. Pricelog merges and validates all parts before Jev runs. The trace records the model, part, chunk, byte count, provider status, and result. A proposed value is not evidence.

Cloudflare lists a `response_format` parameter for Qwen3 30B, but its JSON Mode supported-model list does not list this model. The pipeline checks every response and uses Llama when Qwen fails validation.

Jev receives trimmed Markdown from the same capture as its state. It does not receive the draft as state. Each question asks about one proposed claim. Page profile Choice answers must match the draft and meet the `0.75` confidence threshold. A positive Noul claim must reach `0.80`; a negative claim must be at or below `0.20`. Scores between those limits are uncertain. A current offer name, its exact price label, and a feature name each need support before publication. Closed Choice answers check price role, period, unit, and feature availability. Code also checks that a proposed numeric value occurs in the visible price label.

The public directory shows only accepted claims. The owner view lists rejected, uncertain, invalid, and missing claims for review. Raw draft output and Jev answers stay with the captured version in its Durable Object. If both models fail to produce a valid part, the commercial snapshot is unavailable and Jev does not run for that draft. A scan can still publish its archive and unavailable status.

## Scope and versions

The current commercial snapshot records page profile, page flags, offers, prices, and features. Per-offer pricing policies, two billing-toggle captures, and fact-lab promotion are outside this version. The rubric is version 9 and the commercial snapshot is `pricing-snapshot-v2`. Earlier captures remain historical under their original rubric and fact schema. Their old price and policy facts are not treated as observations under the new rubric.

Current comparisons require an active page, the current rubric, exact Jev model version `jev-1.13.0`, and a capture from the last 14 days. The time limit does not establish that a vendor kept its terms unchanged. New commercial snapshots do not feed the legacy numeric benchmark until a compatible projection is defined.

Acceptance thresholds are rules, not measured accuracy claims. Tests with scripted answers check the pipeline, not model accuracy on live pages.
