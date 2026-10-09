import { createCache, Namespace, type Context } from "@unkey/cache";
import { CloudflareStore } from "@unkey/cache/stores";
import { createRequestLogger } from "evlog";
import { PUBLIC_CACHE_POLICIES, type PublicCache } from "@pricelog/api/public-cache";

export function createPublicCache(
  executionContext: Context,
  domain: string,
  reportError: (error: Error) => void,
): PublicCache {
  const context: Context = {
    waitUntil: (promise) =>
      executionContext.waitUntil(
        promise.then(
          (result) => {
            if (
              result !== null &&
              typeof result === "object" &&
              "err" in result &&
              result.err instanceof Error
            ) {
              reportError(result.err);
            }
          },
          (error: unknown) =>
            reportError(error instanceof Error ? error : new Error(String(error))),
        ),
      ),
  };
  const store = new CloudflareStore<string, unknown>({ domain, cacheBuster: "public-v1" });
  return createCache({
    directory: new Namespace<unknown>(context, {
      stores: [store],
      ...PUBLIC_CACHE_POLICIES.directory,
    }),
    benchmarks: new Namespace<unknown>(context, {
      stores: [store],
      ...PUBLIC_CACHE_POLICIES.benchmarks,
    }),
    versions: new Namespace<unknown>(context, {
      stores: [store],
      ...PUBLIC_CACHE_POLICIES.versions,
    }),
    weekly: new Namespace<unknown>(context, { stores: [store], ...PUBLIC_CACHE_POLICIES.weekly }),
  });
}

export function createCacheErrorReporter(
  executionContext: Context,
  request: Request,
  parentRequestId?: string,
) {
  const method = request.method;
  const path = new URL(request.url).pathname;
  return (error: Error) => {
    const logger = createRequestLogger({
      method,
      path,
      waitUntil: (promise) => executionContext.waitUntil(promise),
    });
    logger.set({ operation: "public-cache.failure", _parentRequestId: parentRequestId });
    logger.error(error);
    logger.emit();
  };
}

export function isPublicDirectoryRequest(request: Request) {
  const path = new URL(request.url).pathname;
  return (
    (request.method === "GET" || request.method === "POST") &&
    (path.startsWith("/rpc/directory/") || path.startsWith("/api-reference/directory/"))
  );
}
