# Live capture failure audit

Checked the live Pricelog owner dashboard on 2026-09-29. It showed 118 tracked pages: 104 with public records and 14 failed pages. Every failed page had zero captures. Each trace stopped during `Capturing page`, before archive, extraction, or verification.

## Failed pages

| Page             | Observed failure                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openrouter.ai`  | Target returned a bot challenge.                                                                                                                       |
| `create.xyz`     | Browser Run returned 422 / 6002 after the state script did not signal and three browser-session navigation timeouts.                                   |
| `replit.com`     | Target returned HTTP 403.                                                                                                                              |
| `ultravox.ai`    | Browser Run returned 422 / 6002 after the state script did not signal and three browser-session navigation timeouts.                                   |
| `kommunicate.io` | Target returned HTTP 301.                                                                                                                              |
| `seamless.ai`    | Target returned a bot challenge.                                                                                                                       |
| `reply.io`       | Target returned HTTP 403 after capture-state fallback attempts.                                                                                        |
| `vectorshift.ai` | Target returned HTTP 403 after the capture-ready selector timed out in browser-session attempts.                                                       |
| `zendesk.com`    | The browser redirect left the claimed domain.                                                                                                          |
| `blink.new`      | Target returned a bot challenge.                                                                                                                       |
| `trickle.so`     | Browser Run returned 422 / 6002 after the state script did not signal and three browser-session navigation timeouts.                                   |
| `bland.ai`       | Target returned a bot challenge.                                                                                                                       |
| `retellai.com`   | Target returned a bot challenge.                                                                                                                       |
| `tabnine.com`    | Browser Run returned 422 / 5006: network connection closed; the provider says DNS failure is one possible cause. Both initial and manual scans failed. |

## Cause groups

- Five targets returned bot challenges.
- Three timed out while waiting for the browser session to finish navigation.
- Three returned HTTP 403.
- One returned HTTP 301.
- One redirected outside its claimed domain.
- One closed the network connection, with DNS failure listed as a possible cause.

The extractor did not run for these 14 failures. Changes to price extraction prompts will not resolve these capture errors. Bot challenges and access denials remain target-side blocks. The redirect and network failures need separate review.

## Code change

The fallback browser session used `networkidle2` before it injected the state script. The three timeout traces show that navigation wait timing out, followed by the same timeout on later attempts. The fallback now waits for `domcontentloaded`; it still waits for Pricelog's capture-ready marker before it reads the page. The pipeline fingerprint was advanced so later scans use a new pipeline ID.

This change targets the three navigation-timeout failures. It has not been verified against a new scan. The bot challenges, 403 responses, redirect failures, and network/DNS failure need other evidence or source-side resolution.

## Other live pages checked

- The directory showed 104 public records.
- Benchmarks showed 80 AI application pages in the selected cohort, 103 eligible of 118 tracked, and 14 pending.
- The weekly changes page reported no captures in either comparison week. Current captures began on 2026-09-28, after the displayed weeks.
- Methodology and waitlist pages rendered.
