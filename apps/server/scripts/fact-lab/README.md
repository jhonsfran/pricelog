# Fact lab

A dev-only harness that measures how archived pricing-page captures become pricing facts with Jev. Nothing here ships in the Worker. Results and findings are in `docs/audits/2026-09-25-fact-lab-cursor.md`.

## Layout

| Path                    | Purpose                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `captures.ts`           | Exports distinct captures from local Alchemy R2 (read-only SQLite) to `tmp/fact-lab/captures/<sha256>/`.            |
| `jev.ts`                | `Decide` for the production pipeline. It calls the dev Jev proxy and caches responses by `sha256(model + request)`. |
| `run.ts`                | Runs one variant on every distinct capture of a domain, scores against gold, and appends to `experiments.jsonl`.    |
| `score.ts`              | Precision, recall and field completeness against gold, plus a week-over-week diff.                                  |
| `schema.ts`             | Lab fact, variant and gold types.                                                                                   |
| `state/page-context.ts` | Page context from the archived HTML: selected tabs and toggles, JSON-LD offers.                                     |
| `state/sections.ts`     | Heading sections of the Markdown and where each UI control sits in them.                                            |
| `state/windows.ts`      | One window per price literal: the literal, its unit and period terms, the lines around it, pairs and ranges.        |
| `state/names.ts`        | Plan-name candidates and, per price, the order in which to try them.                                                |
| `state/derive.ts`       | Currency from the literal, JSON-LD corroboration, offers hidden behind unselected tabs.                             |
| `variants/engine.ts`    | The fact engine: builds the one Jev request per capture and makes every decision in code.                           |
| `variants/current.ts`   | The current best version, `names-v16a`: the engine plus its calibrated thresholds.                                  |
| `variants/baseline.ts`  | The production collector (`collectPricingFacts`), unchanged, for comparison.                                        |
| `gold/<sha256>.json`    | Draft labels per capture. **Not yet approved by the owner.**                                                        |
| `experiments.jsonl`     | Append-only log of runs of the registered variants.                                                                 |

Data lives in `tmp/fact-lab/` (gitignored): captures, the response cache and per-run outputs.

## History

The lab tried 16 engine versions: heading-based cards (v1–v3), price windows (v4) and price windows with plan-name checks (v5–v16). Commit `70fd614` keeps every one of them with the full run log, so any earlier run can be reproduced by checking out that commit. After it, the best version was consolidated into `engine.ts` and `current.ts` without changing a request or a decision: all 29 captures give identical facts from the cache.

## Jev access

The harness never handles credentials. A local Worker forwards requests to the Workers AI binding, using your existing Alchemy Cloudflare login. The binding runs through an ephemeral preview session, so nothing is deployed.

Create `packages/infra/tmp/fact-lab-jev/` (gitignored) with these two files. They must sit under `packages/infra` so `alchemy` and `effect` resolve.

`alchemy.run.ts`:

```ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { localState } from "alchemy/State";
import * as Effect from "effect/Effect";

export const proxy = Cloudflare.Worker("fact-lab-jev", {
  main: "./worker.ts",
  compatibility: { date: "2026-03-24", flags: ["nodejs_compat"] },
  env: { AI: Cloudflare.Workers.AI("AI") },
  dev: { port: 4400 },
});

export default Alchemy.Stack(
  "fact-lab-jev",
  { providers: Cloudflare.providers(), state: localState() },
  Effect.gen(function* () {
    const worker = yield* proxy;
    return { url: worker.url };
  }),
);
```

`worker.ts`:

```ts
type Env = { AI: { run(model: string, input: unknown, options?: unknown): Promise<unknown> } };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    const input = await request.json();
    const started = Date.now();
    try {
      const result = await env.AI.run("typesafe/jev", input, {
        gateway: { id: "default", skipCache: true, collectLog: true },
      });
      return Response.json({ result, ms: Date.now() - started });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error), ms: Date.now() - started },
        { status: 502 },
      );
    }
  },
};
```

Start it with:

```bash
cd packages/infra/tmp/fact-lab-jev
../../node_modules/.bin/alchemy dev --no-input --config alchemy.run.ts --stage factlab
```

Set `FACT_LAB_JEV_URL` to use another endpoint. The default is `http://localhost:4400`. Runs whose requests are all in the cache do not need the proxy.

## Commands

```bash
bun apps/server/scripts/fact-lab/captures.ts cursor.com fin.ai          # export captures
bun apps/server/scripts/fact-lab/run.ts --domain cursor.com             # current best version
bun apps/server/scripts/fact-lab/run.ts --domain cursor.com --no-cache --note "stability"
bun apps/server/scripts/fact-lab/run.ts --variant baseline --domain fin.ai --print
```

`--variant` defaults to `names-v16a`. `--no-cache` resamples Jev. Jev is not deterministic, so use it to measure stability. Cached runs are free and reproduce earlier answers exactly.

## Rules

- Jev is the only model that reads page content. Code finds candidate literals and derives values, units, periods and currency. Jev classifies prices and confirms plan names.
- A variant is immutable once it has run. To try a change, add a new variant and a new engine or state file rather than editing the current ones, and register it in `variants/index.ts`.
- Gold is a draft until the owner approves it. Do not tune on a page you use as a holdout; a page used for tuning is no longer a holdout.
