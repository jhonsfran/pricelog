import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

import { browserBinding } from "./browser-binding";

export const db = Cloudflare.D1.Database("database", {
  migrations: "../../packages/db/src/migrations",
});

export const artifacts = Cloudflare.R2.Bucket("pricing-artifacts");

export const server = Cloudflare.Worker("server", {
  main: "../../apps/server/src/index.ts",
  compatibility: {
    date: "2026-03-24",
    flags: ["nodejs_compat"],
  },
  env: {
    DB: db,
    ARTIFACTS: artifacts,
    BROWSER: browserBinding,
    AI: Cloudflare.Workers.AI("AI"),
    PAGE_STORE: Cloudflare.DurableObject("PageStore", { className: "PageStore" }),
    SCAN_WORKFLOW: Cloudflare.Workflow("ScanWorkflow", { className: "ScanWorkflow" }),
    CORS_ORIGIN: Config.String("CORS_ORIGIN"),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    PAGE_OPERATOR_EMAILS: Config.String("PAGE_OPERATOR_EMAILS").pipe(Config.withDefault("")),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
    LOG_FORMAT: process.env.ALCHEMY_DEV === "true" ? "pretty" : "json",
  },
  // Daily benchmark snapshot. The index screen reads the latest snapshot; this
  // is also what accumulates the aggregate time series.
  crons: ["0 3 * * *"],
  dev: {
    port: 4000,
  },
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "my-better-t-app",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const serverWorker = yield* server;
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      rootDir: "../../apps/web",
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
      },
      dev: {
        port: 4100,
      },
    });

    return {
      web: webWorker.url,
      server: serverWorker.url,
    };
  }),
);
