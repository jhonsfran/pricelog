# Read the methodology

The methodology explains what Pricelog records, how a claim becomes public, and how comparisons use dated sources.

## Sub-features

- `methodology-footer` opens the page from the footer.
- `methodology-comparison` opens it from a comparison when sample data is present.
- `methodology-content` shows the record, acceptance, source, and question sections.

## How to get to it (user POV)

- Choose `Methodology` in the footer from any public page.
- Choose `How this is measured` on a populated comparison.
- Choose `How comparisons are verified` on Weekly changes.

## Driving it with agent-browser

Preconditions:

- Doctor passes. No published captures are needed for the footer path.
- Attach mode is sufficient. This is a read-only public page.

- **Start.** Run `rtk proxy agent-browser --session pricelog-verify-1 open http://127.0.0.1:4100/` and `rtk proxy agent-browser --session pricelog-verify-1 snapshot -i`. Require the footer `Methodology` link. Save this snapshot as `before.txt`.
- **Navigate.** Run `rtk proxy agent-browser --session pricelog-verify-1 focus 'a[href="/methodology"]'` and `rtk proxy agent-browser --session pricelog-verify-1 press Enter`.
- **Confirm.** Run `rtk proxy agent-browser --session pricelog-verify-1 get url` and `rtk proxy agent-browser --session pricelog-verify-1 snapshot -i`. Require `/methodology`, the `Methodology` level-one heading, and the `What we record`, `How a claim becomes public`, `Source and comparisons`, `Page choices`, and `Page flags` headings. Save the URL, snapshot, and screenshot.
- **Other entry points.** From `/changes`, follow `How comparisons are verified` and confirm the same page. From `/benchmarks`, follow `How this is measured` only when the link is visible. Record each entry point checked.

## Gotchas

- A direct visit to `/methodology` checks rendering, but it does not check the footer navigation action.
- The comparison entry point depends on selected sample data. The footer entry point does not.
- This page is static, so it can render even when a data-backed route fails. Keep its proof scope explicit.
