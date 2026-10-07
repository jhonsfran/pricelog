import { createCache, Namespace, type Context } from "@unkey/cache";
import { CloudflareStore } from "@unkey/cache/stores";
import { PUBLIC_CACHE_POLICIES, type PublicCache } from "@pricelog/api/public-cache";

export function createPublicCache(context: Context, domain: string): PublicCache {
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

export function isPublicDirectoryRequest(request: Request) {
  const path = new URL(request.url).pathname;
  return (
    (request.method === "GET" || request.method === "POST") &&
    (path.startsWith("/rpc/directory/") || path.startsWith("/api-reference/directory/"))
  );
}
