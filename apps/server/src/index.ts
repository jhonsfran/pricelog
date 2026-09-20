import { appRouter } from "@my-better-t-app/api/routers/index";
import { parseAllowedOrigins } from "@my-better-t-app/auth";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { initLogger } from "evlog";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { evlog, type EvlogVariables, useLogger } from "evlog/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { serveArtifact } from "./artifacts";
import { createContext } from "./context";
import { ENV } from "./env.server";
import { resolveLogEnvironment } from "./logging";
import { createAuth } from "./services";

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

export default app;
