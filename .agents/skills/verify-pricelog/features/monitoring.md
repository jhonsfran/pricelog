# Monitor an owned page

An owner can sign in, submit one pricing-page URL, see scan status, and inspect the page's run history and artifacts.

## Sub-features

- `monitor-auth` signs in or creates a local test account.
- `monitor-add` submits one HTTPS pricing-page URL.
- `monitor-status` shows the queued or running scan and later result.
- `monitor-history` opens the page detail and its capture history.

## How to get to it (user POV)

- Choose `Track a page` in the footer, then sign in or create an account.
- Choose `Sign in` in the header, then open `Your pages` from the account menu.
- Enter a URL in `Pricing page URL` on `/dashboard` and choose `Add page`.
- Choose the new page row to inspect its history and artifacts.

## Driving it with agent-browser

Preconditions:

- Use a run-owned full-stack instance and disposable local account. Do not run this write path on an attached shared instance.
- The server environment must support the scan bindings. Use a pricing page controlled for verification; a new domain queues a real scan.

- **Authenticate.** Open `/login`, snapshot, and use the `Name`, `Email`, and `Password` fields under `Create account`, or choose `Sign in` and use the two labeled fields. Require navigation to `/dashboard` and the `Your pages` heading.
- **Submit.** Fill `#pricing-url` with the controlled HTTPS pricing URL, snapshot, then click the `Add page` button. Require the `Pricing page added. The first scan is queued.` message and a new domain row.
- **Inspect.** Click the row's fresh reference. Require a `/dashboard/pages/` URL, the same domain, and a visible run state. When the scan completes, inspect the run history and artifact download links. Reopen `/dashboard` and confirm the row persists.
- **Proof.** Save before and after browser snapshots, the detail URL, and a screenshot. Use a read-only view of the run-owned database or a page reload to confirm the submitted record, then record the scan outcome separately.

## Gotchas

- The first scan is asynchronous. A queued state proves submission, not successful capture.
- A domain can have only one owner in this MVP. Use a fresh controlled domain for a new ownership proof.
- Browser Run, Workers AI, and R2 are external services in the full stack. Record their actual result rather than treating a queued message as completion.
- Do not remove another person's page or account as cleanup. This app has no delete flow.
