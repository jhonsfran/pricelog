# Compare pricing practices

The comparison page shows how eligible captured pages state pricing practices for a selected product category and pricing question.

## Sub-features

- `benchmark-category` changes the product category.
- `benchmark-question` changes the pricing question.
- `benchmark-coverage` shows eligible, stale, incompatible, and pending counts.
- `benchmark-examples` opens the pages behind an answer when current data exists.

## How to get to it (user POV)

- Choose `Compare pricing` in the primary navigation or footer.
- Submit `Compare pricing practices` from the directory hero.
- Select a bar in a comparison to open its matching directory pages.
- Choose `How this is measured` to read the methodology when a sample exists.

## Driving it with agent-browser

Preconditions:

- Doctor passes. Eligible recent captures are needed for bars and examples.
- Attach mode is sufficient for read-only comparison checks.

- **Open.** Run `rtk proxy agent-browser --session pricelog-verify-1 open http://127.0.0.1:4100/benchmarks` and `rtk proxy agent-browser --session pricelog-verify-1 snapshot -i`. Require `Compare how AI products charge`, `Product category`, and `Pricing question`.
- **Select a category.** Click `#product-category`, snapshot the open choices, then click an option by its fresh reference. Require the selected label and URL `cohort` value to change. Capture before and after.
- **Select a question.** Click `#pricing-question`, snapshot the open choices, then click `Published prices` by its fresh reference. Require the question label and URL `topic` value to change.
- **Check coverage.** Require `Eligible pages`, `Outside capture window`, `Need a new analysis`, and `Pending` when the API returns data. If the API reports no current observations, record that visible state.
- **Open examples.** When a chart bar exists, click its fresh link, require `/` with filter chips and a matching page count, then use a row to open a public profile.

## Gotchas

- Comparisons use captures from the last 14 days, the current rubric, and the accepted Jev model. A published profile can exist without entering a current comparison.
- Small samples show counts in place of percentages.
- The `How this is measured` link appears with selected comparison data. The footer always has a `Methodology` link.
