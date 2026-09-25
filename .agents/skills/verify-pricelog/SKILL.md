---
name: verify-pricelog
description: Verify Pricelog's web UI through its running app with agent-browser. Use after changes to the directory, comparisons, weekly changes, methodology, or owner dashboard.
---

# Verify Pricelog

Pricelog's primary user surface is the TanStack Start web app at `http://127.0.0.1:4100`. Hono and oRPC serve its data at `http://127.0.0.1:4000`. The web dev server forwards `/rpc` and `/api` to port 4000. Read [the feature map](features/README.md) before choosing a path. Use `agent-browser` in a separate named session. Prefix shell commands with `rtk` as required by this repo's agent instructions.

## Launch

First check whether ports 4000 and 4100 already have listeners:

```bash
rtk proxy lsof -nP -iTCP:4000 -iTCP:4100 -sTCP:LISTEN
```

If both services are already running, attach for **read-only public paths**. Do not restart or stop those processes. Keep the browser in a new `agent-browser --session pricelog-verify-<run-id>` session, separate from the user's browser. This attach path was exercised on 2026-09-26.

If neither port has a listener and the repo's ignored environment files are configured, start the documented full stack from the repo root in a foreground PTY:

```bash
rtk proxy pnpm run dev
```

Record the PTY session ID returned by the command. Wait for the web origin on port 4100 and the API origin on port 4000. The full stack uses Alchemy development resources and shared local ports. Run only one instance. If one port is occupied or the environment is incomplete, stop and report the missing precondition. Do not attach a mutating proof to another person's instance.

## Doctor

Run this read-only check before browser work and whenever a page looks wrong:

```bash
rtk proxy curl -fsS http://127.0.0.1:4000/
rtk proxy curl -fsSI http://127.0.0.1:4100/
rtk proxy lsof -nP -iTCP:4000 -iTCP:4100 -sTCP:LISTEN
```

Require `OK` from the API, HTTP 200 from the web app, and listeners on both ports. After opening the browser, require the title `Pricelog — The open pricing index` and the `PRICELOG` link in the accessibility snapshot. A working HTTP response alone does not prove client navigation or data loading.

## Drive

Choose a unique browser session name for the run and use it on every command. The commands below use `pricelog-verify-1`; change the suffix if that session exists. Use the same suffix as the proof directory name. `agent-browser` is the browser harness. Use the current accessibility snapshot to choose an element reference, and take a new snapshot after navigation or data changes.

```bash
rtk proxy agent-browser --session pricelog-verify-1 open http://127.0.0.1:4100/
rtk proxy agent-browser --session pricelog-verify-1 snapshot -i
rtk proxy agent-browser --session pricelog-verify-1 get title
```

For the public methodology path, focus the footer's route link and press Enter. The exact selector is in `apps/web/src/components/site-footer.tsx`:

```bash
rtk proxy agent-browser --session pricelog-verify-1 focus 'a[href="/methodology"]'
rtk proxy agent-browser --session pricelog-verify-1 press Enter
rtk proxy agent-browser --session pricelog-verify-1 get url
rtk proxy agent-browser --session pricelog-verify-1 snapshot -i
```

Require `/methodology` in the URL, the `Methodology` level-one heading, and the `What we record`, `How a claim becomes public`, and `Source and comparisons` sections. The feature files give exact entry points, controls, and end states for the other paths. Use accessible names and route links where possible. Avoid screen coordinates.

## Evidence

Store proof outside the checkout at `/private/tmp/pricelog-verification/<run-id>/` so cleanup does not remove it. Save a snapshot before the user action, a second snapshot after it, the final URL, and a screenshot. Record the feature ID, action, and result in `actions.txt`. Example commands for the methodology path:

```bash
rtk proxy mkdir -p /private/tmp/pricelog-verification/pricelog-verify-1
rtk proxy agent-browser --session pricelog-verify-1 snapshot -i > /private/tmp/pricelog-verification/pricelog-verify-1/before.txt
# Perform the focus and Enter actions from Drive.
rtk proxy agent-browser --session pricelog-verify-1 snapshot -i > /private/tmp/pricelog-verification/pricelog-verify-1/after.txt
rtk proxy agent-browser --session pricelog-verify-1 get url > /private/tmp/pricelog-verification/pricelog-verify-1/url.txt
rtk proxy agent-browser --session pricelog-verify-1 screenshot /private/tmp/pricelog-verification/pricelog-verify-1/after.png --full
```

Proof must show the user action and resulting state. For a write, confirm the effect from a second user-facing view and, when possible, the stored record. Do not use internal setters or test-only endpoints as the user action. Mock only an external system that already has a production boundary. If a route needs data that the instance lacks, record the unmet precondition instead of calling the route verified.

## Cleanup

Close only the browser session used for the run:

```bash
rtk proxy agent-browser --session pricelog-verify-1 close
```

For an attached app, stop here. Leave its server processes and data intact. For an instance started by this run, send Ctrl-C to the recorded PTY session ID, then check that its ports are free. Never kill a process by name or stop a listener that predates the run. Keep the proof directory after cleanup and confirm that `before.txt`, `after.txt`, and `after.png` remain.

## Helpers

This skill ships no helper script. Use `agent-browser` and the repo's documented `pnpm run dev` command directly. If `agent-browser` is unavailable, report that precondition; do not substitute a DOM-only assertion for a user action.
