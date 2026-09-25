# Fact lab

A dev-only harness that measures how archived pricing-page captures become pricing facts with Jev. Nothing here ships in the Worker. Results and findings are in `docs/audits/2026-09-25-fact-lab-cursor.md`.

## Layout

| Path                 | Purpose                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `captures.ts`        | Exports distinct captures from local Alchemy R2 (read-only SQLite) to `tmp/fact-lab/captures/<sha256>/`.                   |
| `jev.ts`             | `Decide` for the production pipeline. It calls the dev Jev proxy and caches responses by `sha256(model + request)`.        |
| `run.ts`             | Runs one variant on every distinct capture of a domain, scores against gold, and appends to `experiments.jsonl`.           |
| `score.ts`           | Precision, recall and field completeness against gold, plus a week-over-week diff.                                         |
| `schema.ts`          | Lab fact, variant and gold types.                                                                                          |
| `state/`             | State builders: page context from HTML, price windows, plan-name candidates. Append-only; a changed builder is a new file. |
| `variants/`          | Immutable variants. Each is a fingerprint over its source files and settings.                                              |
| `gold/<sha256>.json` | Draft labels per capture. **Not yet approved by the owner.**                                                               |
| `experiments.jsonl`  | Append-only log of every run.                                                                                              |

Data lives in `tmp/fact-lab/` (gitignored): captures, the response cache and per-run outputs.

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

Set `FACT_LAB_JEV_URL` to use another endpoint. The default is `http://localhost:4400`.

## Commands

```bash
bun apps/server/scripts/fact-lab/captures.ts cursor.com fin.ai          # export captures
bun apps/server/scripts/fact-lab/run.ts --variant names-v16a --domain cursor.com
bun apps/server/scripts/fact-lab/run.ts --variant names-v16a --domain cursor.com --no-cache --note "stability"
bun apps/server/scripts/fact-lab/run.ts --variant baseline --domain fin.ai --print
```

`--no-cache` resamples Jev. Jev is not deterministic, so use it to measure stability. Cached runs are free and reproduce earlier answers exactly.

## Rules

- Jev is the only model that reads page content. Code finds candidate literals and derives values, units, periods and currency. Jev classifies and confirms names.
- Every variant is immutable once it has run. Change behavior in a new engine or state file, never in place.
- Gold is a draft until the owner approves it. Do not tune on a page you use as a holdout; a page used for tuning is no longer a holdout.
