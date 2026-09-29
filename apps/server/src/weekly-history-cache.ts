import type { readWeeklyHistory } from "@pricelog/api/pricing-history-store";
import { CacheError, Namespace, createCache } from "@unkey/cache";
import { MemoryStore, type Entry, type Store } from "@unkey/cache/stores";
import superjson from "superjson";

type WeeklyHistory = Awaited<ReturnType<typeof readWeeklyHistory>>;

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;
const CACHE_NAME = "pricelog-weekly-history-v1";
const CACHE_ORIGIN = "https://api.usepricelog.com";

export class WeeklyHistoryCloudflareStore implements Store<string, WeeklyHistory> {
  readonly name = "cloudflare-weekly-history";

  constructor(private readonly memory: Store<string, WeeklyHistory>) {}

  private request(namespace: string, key: string) {
    return new Request(
      `${CACHE_ORIGIN}/__internal-cache/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`,
    );
  }

  async get(namespace: string, key: string) {
    try {
      const response = await (await caches.open(CACHE_NAME)).match(this.request(namespace, key));
      if (!response) return { val: undefined };
      const entry = superjson.parse<Entry<WeeklyHistory>>(await response.text());
      await this.memory.set(namespace, key, entry);
      return { val: entry };
    } catch {
      return { val: undefined };
    }
  }

  async set(namespace: string, key: string, entry: Entry<WeeklyHistory>) {
    try {
      const remaining = entry.staleUntil - Date.now();
      if (remaining <= 0) return { val: undefined };
      const response = new Response(superjson.stringify(entry), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${Math.min(86_400, Math.ceil(remaining / 1_000))}`,
        },
      });
      await (await caches.open(CACHE_NAME)).put(this.request(namespace, key), response);
      return { val: undefined };
    } catch (error) {
      return { err: this.error(key, error) };
    }
  }

  async remove(namespace: string, keys: string | string[]) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        (Array.isArray(keys) ? keys : [keys]).map((key) =>
          cache.delete(this.request(namespace, key)),
        ),
      );
      return { val: undefined };
    } catch (error) {
      return { err: this.error(String(keys), error) };
    }
  }

  private error(key: string, cause: unknown) {
    return new CacheError({
      tier: this.name,
      key,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

const memoryStore = new MemoryStore<string, WeeklyHistory>({
  persistentMap: new Map(),
  unstableEvictOnSet: { frequency: 1, maxItems: 8 },
});
const cloudflareStore = new WeeklyHistoryCloudflareStore(memoryStore);
const inFlight = new Map<string, Promise<WeeklyHistory>>();

function loadOnce(key: string, load: () => Promise<WeeklyHistory>) {
  const current = inFlight.get(key);
  if (current) return current;
  const pending = Promise.resolve()
    .then(load)
    .finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
  inFlight.set(key, pending);
  return pending;
}

/** A new namespace binds background work to the current Worker request. */
export function createWeeklyHistoryCache(
  waitUntil: (promise: Promise<unknown>) => void,
  stores: Store<string, WeeklyHistory>[] = [memoryStore, cloudflareStore],
) {
  const cache = createCache({
    weeklyHistory: new Namespace<WeeklyHistory>({ waitUntil }, { stores, fresh: HOUR, stale: DAY }),
  });

  return {
    async getOrLoad(periodEnd: Date, load: () => Promise<WeeklyHistory>): Promise<WeeklyHistory> {
      const key = `v1:${periodEnd.toISOString()}`;
      const result = await cache.weeklyHistory.swr(key, () => loadOnce(key, load));
      if (result.err) throw result.err;
      if (!result.val) throw new Error("Weekly history is empty");
      return result.val;
    },
  };
}
