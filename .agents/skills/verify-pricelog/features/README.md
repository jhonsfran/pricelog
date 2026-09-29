# Pricelog verification map

This map is the maintained source for user-facing verification. Read the main [verification skill](../SKILL.md), run Doctor, and use the matching feature file. The web app is the primary surface. The API and Cloudflare services are supporting surfaces.

## Baseline preconditions

- The web app answers at `http://127.0.0.1:4100` and the API returns `OK` at `http://127.0.0.1:4000/`.
- The browser uses its own named `agent-browser` session.
- An attached instance permits read-only public paths. Account creation, page submission, and scan requests need a run-owned development instance and disposable data.
- Public directory rows and benchmark bars depend on published captures. Do not assume the database has them.

## Driving conventions

- Start from the route named in each feature file.
- Run `agent-browser snapshot -i` before choosing references and again after navigation.
- Prefer route links, labeled fields, and headings. Do not rely on coordinates or row position.
- Preserve `before.txt`, `after.txt`, `url.txt`, `after.png`, and `actions.txt` under `/private/tmp/pricelog-verification/<run-id>/`.
- Report each entry point checked. A skipped path is not verified through another path.

## Features

- [Browse and search pages](directory.md) covers directory search, empty matches, filters, and profile entry.
- [Compare pricing practices](benchmarks.md) covers category and question selection, sample coverage, and source-page links.
- [Read weekly changes](changes.md) covers category selection and dated before-and-after evidence.
- [Read the methodology](methodology.md) covers the public explanation and its entry points.
- [Monitor an owned page](monitoring.md) covers sign-in, page submission, scan status, and history. Use a run-owned instance for writes.
