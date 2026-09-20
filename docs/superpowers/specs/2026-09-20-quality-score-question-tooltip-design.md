# Quality score question tooltip

## Goal

Help a reader understand what each quality score measures without leaving the score card.

## Design

Add a small information button after each score label. Hover, keyboard focus, or touch activation opens a tooltip with the exact question used to evaluate that score.

Example:

- Label: `Cost predictability`
- Tooltip: `How well can a buyer predict their actual recurring cost?`

The button must have an accessible name that includes the score label. The tooltip must not replace the visible label or become the only source of essential information.

## Data flow

Keep each score label and question in the shared pricing score catalog. The web score grid resolves this metadata by score key and renders the question in the tooltip. Unknown score keys keep the current formatted fallback label and do not show an information button.

The server rubric must use the same shared question text so the evaluation prompt and the UI cannot drift apart.

## Scope

This change includes:

- A tooltip for each known quality score.
- Pointer, keyboard, and touch access.
- Shared question text for the server rubric and web UI.
- Component tests for known and unknown score keys.

This change does not include the five scoring levels, evidence from the scanned page, or a detailed explanation of the overall score.

## Failure behavior

If the client receives an unknown score key, it shows the formatted label and score without a tooltip. This keeps newer server data usable in an older client.

## Verification

- Confirm that each known score shows its exact rubric question.
- Confirm that the tooltip opens with hover, keyboard focus, and touch activation.
- Confirm that unknown score keys still render without an error.
- Run the focused web and pricing intelligence tests, then run the relevant type check.
