# Read weekly changes

Weekly changes compares published terms from two complete UTC weeks and links to dated source captures.

## Sub-features

- `changes-list` shows current comparison history or its empty state.
- `changes-category` selects a product category.
- `changes-evidence` opens before-and-after source links for a change.

## How to get to it (user POV)

- Choose `Weekly changes` in the primary navigation or footer.
- Choose `See weekly changes` from the directory hero.
- Choose `How comparisons are verified` to read the methodology.

## Driving it with agent-browser

Preconditions:

- Doctor passes. Two completed weeks of compatible captures are needed for a change row.
- Attach mode is sufficient for read-only paths.

- **Open.** Run `rtk proxy agent-browser --session pricelog-verify-1 open http://127.0.0.1:4100/changes` and `rtk proxy agent-browser --session pricelog-verify-1 snapshot -i`. Require `Weekly changes`, `Product category`, and `How comparisons are verified`.
- **Change category.** Click `#product-category`, snapshot the options, and click a category's fresh reference. Require the selected label and URL `cohort` value to change.
- **Read evidence.** If a change row exists, open its page link and the dated before-and-after source links. Capture the two source URLs and their displayed capture dates. If no row exists, capture the visible empty state and report that evidence links were not exercised.

## Gotchas

- The report uses adjacent completed UTC weeks. No change row is valid evidence of an empty report, not of source-link behavior.
- Source links can open a new tab. Check the target URL and keep the main browser tab for the report.
- Do not infer that a pricing term changed from a current profile alone.
