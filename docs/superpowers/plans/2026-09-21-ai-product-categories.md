# AI product categories implementation plan

> Use subagent-driven-development for the bounded category implementation and reviews. The owner approved eight categories and five products per category, followed by separate commits.

**Goal:** Populate the local index with 40 real AI product pricing pages and show evidence-based category aggregations.

**Architecture:** The shared Jev rubric defines eight application categories and a separate model API category. One primary category is accepted only from a confident Jev answer. Candidate category labels select the sample and never override results. Existing page DOs own scans and versions; D1 holds current summaries and aggregate snapshots.

**Tech stack:** Existing TypeScript, Jev, Cloudflare Workers, page DOs, D1, R2, React and Vitest.

## Approved design

Categories: coding assistants, AI app builders, customer support agents, voice agents, AI video generation, workflow and agent builders, AI sales and prospecting, and AI meeting assistants. Use a new rubric version because category criteria changed. Prefer the specific end-user task over a generic agent-building label. Model APIs stay separately selectable. General SaaS and ambiguous products must not enter the main AI application overview. Five samples per category show counts; the existing minimum of ten remains for category percentages.

## Tasks

- [x] Update `packages/db/src/pricing-intelligence.ts`, server rubric and category tests. Bump the rubric to v5, define distinct category criteria, and retain unknown/not-disclosed answers.
- [x] Update `packages/api/src/benchmark.ts` and `apps/web/src/routes/benchmarks.tsx` so the default AI application overview excludes model APIs and unrelated products. Keep eight category selectors and a separate model API selector. Test membership and aggregate denominators.
- [x] Record 40 public pricing URLs in `docs/data/ai-products.json`, five candidates per category. Check redirects and avoid duplicate domains. Add and scan through the existing authenticated local app. Do not insert fabricated observations or force Jev classifications.
- [x] Inspect scan outcomes, archived sources, model/rubric versions, and live category counts. Retry transient failures; use documented replacement candidates if a page cannot be captured. Record unresolved failures or classifications honestly in `docs/data/ai-products-scan-report.md`.
- [x] Run `rtk pnpm test`, `rtk pnpm check-types`, `rtk pnpm exec oxlint`, changed-file formatting, and `rtk git diff --check`. Verify the populated benchmark UI. Review category specification and code quality.
- [x] Create separate commits for backend index/storage, public interface/product docs, and the reproducible example manifest plus verification report. Include all authorized work from this task; exclude credentials and runtime databases. No remote deployment or push.

## Result

All eight categories contain five successful Jev-classified products. See [the scan report](../../data/ai-products-scan-report.md) for exact run IDs, replacements, checks, and remaining limits. The existing weekly verifier retains its stricter source limit.
