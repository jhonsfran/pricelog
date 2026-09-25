import type { Variant } from "../schema";
import { baseline } from "./baseline";
import { current } from "./current";

/**
 * Registered variants: the production collector and the current best version. A variant is
 * immutable once it has run; add a new one to try a change. Earlier iterations are in commit
 * 70fd614.
 */
export const VARIANTS: Record<string, Variant> = Object.fromEntries(
  [baseline, current].map((variant) => [variant.id, variant]),
);
