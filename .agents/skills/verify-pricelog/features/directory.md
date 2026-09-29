# Browse and search pages

The directory lists published pricing pages and lets a reader find a company or domain, narrow the list, and open its public profile.

## Sub-features

- `directory-list` shows the page count and published rows or the indexed-empty state.
- `directory-search` narrows rows by company or domain.
- `directory-empty` explains a search with no match.
- `directory-profile` opens a dated public page profile.

## How to get to it (user POV)

- Open `/` directly or choose `Directory` in the primary navigation.
- Press `/` outside an input to focus search. Press Escape in search to clear and blur it.
- Choose a pricing-page row to open `/pages/<slug>`.
- A benchmark answer can lead back to `/` with a filter chip.

## Driving it with agent-browser

Preconditions:

- Doctor passes. Published captures are needed for a row and profile proof.
- Attach mode is sufficient because these actions only read public data.

- **Open.** Run `rtk proxy agent-browser --session pricelog-verify-1 open http://127.0.0.1:4100/` and `rtk proxy agent-browser --session pricelog-verify-1 snapshot -i`. Require the `Browse pricing pages` heading and the `Search pricing pages` searchbox.
- **Search.** Run `rtk proxy agent-browser --session pricelog-verify-1 fill '#directory-search' 'a-domain-not-in-the-directory.invalid'`. Snapshot again. Require `No pages match these filters.` and no result rows.
- **Clear.** Run `rtk proxy agent-browser --session pricelog-verify-1 fill '#directory-search' ''`. Snapshot again. Require the original count or indexed-empty state to return.
- **Open a profile.** From a nonempty directory, snapshot and choose a row by its domain, then click its fresh reference. Require a URL under `/pages/`, a heading with the same domain, and a dated source or a clear unavailable state. Capture both list and profile states.

## Gotchas

- Search is deferred. Wait for the matching or empty state after filling.
- The slash shortcut does not run while an input has focus.
- A row exists only after a successful published capture. Do not treat an empty local database as a failed profile route.
- Filter chips change the URL. Record the full URL when checking a filtered list.
