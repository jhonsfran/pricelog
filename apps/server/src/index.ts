import { storeBenchmarks } from "@pricelog/api/benchmark-store";
import { appRouter } from "@pricelog/api/routers/index";
import { parseAllowedOrigins } from "@pricelog/auth";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { initLogger, log } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables, useLogger } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { serveArtifact, servePublicScreenshot, servePublicSource } from "./artifacts";
import { pageMonitorService } from "./pricing/service";
import { runWeeklyComparisons } from "./pricing/weekly-comparisons";
import { createContext } from "./context";
import { ENV } from "./env.server";
import { resolveLogEnvironment } from "./logging";
import { createAuth, getDb } from "./services";

export { PageStore } from "./pricing/page-store";
export { ScanWorkflow } from "./pricing/scan-workflow";

const environment = resolveLogEnvironment({
  LOG_FORMAT: ENV.LOG_FORMAT,
  ALCHEMY_DEV: process.env.ALCHEMY_DEV,
  NODE_ENV: process.env.NODE_ENV,
});

initLogger({
  env: { service: "pricelog", environment },
  pretty: environment !== "production",
});

function logHandlerError(error: unknown) {
  useLogger().error(error instanceof Error ? error : new Error(String(error)));
}

const identifyUser = createAuthMiddleware((await createAuth()) as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

const app = new Hono<EvlogVariables>();

app.use(evlog());
app.use("*", async (c, next) => {
  await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
  await next();
});

app.use(
  "/*",
  cors({
    origin: parseAllowedOrigins(ENV.CORS_ORIGIN),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => (await createAuth()).handler(c.req.raw));
app.get("/api/pages/:pageId/runs/:runId/artifacts/:kind", serveArtifact);
app.get("/api/public/pages/:pageId/runs/:runId/source", servePublicSource);
app.get("/api/public/pages/:pageId/runs/:runId/screenshot", servePublicScreenshot);

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      logHandlerError(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      logHandlerError(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

/**
 * Appends one benchmark snapshot per cohort. Distributions could be computed on
 * read, but snapshots are what turn the index into a time series, and that
 * history cannot be backfilled later.
 */
async function runBenchmarkSnapshot() {
  try {
    const cohorts = await storeBenchmarks(getDb());
    log.info({ action: "benchmark.snapshot", cohorts });
    const comparisons = await runWeeklyComparisons(getDb(), pageMonitorService, async (key) => {
      const object = await ENV.ARTIFACTS.get(key);
      return object ? object.text() : null;
    });
    log.info({ action: "benchmark.weekly-comparisons", ...comparisons });
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    log.error(cause);
    throw cause;
  }
}

export default {
  fetch: app.fetch,
  scheduled: (_controller, _env, ctx) => {
    ctx.waitUntil(runBenchmarkSnapshot());
  },
} satisfies ExportedHandler;
