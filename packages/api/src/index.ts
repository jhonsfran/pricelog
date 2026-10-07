import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { publicCacheKey, type PublicCacheScope } from "./public-cache";

export const o = os.$context<Context>();

export const publicProcedure = o;

const cacheContext = os.$context<Pick<Context, "publicCache" | "reportCacheError">>();

export function publicCacheMiddleware(scope: PublicCacheScope) {
  return cacheContext.middleware(async ({ context, path, next }, input, output) => {
    if (!context.publicCache) return next();

    let origin: ReturnType<typeof next> | undefined;
    const result = await context.publicCache[scope].swr(
      await publicCacheKey(path, input, scope),
      async () => {
        origin ??= next();
        return (await origin).output;
      },
    );
    if (result.err) {
      context.reportCacheError?.(result.err);
      return origin ?? next();
    }
    return output(result.val);
  });
}

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
