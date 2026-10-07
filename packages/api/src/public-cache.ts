import type { Cache } from "@unkey/cache";

export const PUBLIC_CACHE_POLICIES = {
  directory: { fresh: 60 * 60_000, stale: 24 * 60 * 60_000 },
  benchmarks: { fresh: 15 * 60_000, stale: 60 * 60_000 },
  versions: { fresh: 24 * 60 * 60_000, stale: 7 * 24 * 60 * 60_000 },
  weekly: { fresh: 60 * 60_000, stale: 24 * 60 * 60_000 },
};

export type PublicCache = Cache<{ [Scope in keyof typeof PUBLIC_CACHE_POLICIES]: unknown }>;
export type PublicCacheScope = keyof PublicCache;

export async function publicCacheKey(
  path: readonly string[],
  input: unknown,
  scope: PublicCacheScope,
) {
  const week = new Date();
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const serialized = JSON.stringify([
    path,
    input ?? null,
    scope === "weekly" ? week.toISOString().slice(0, 10) : null,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
