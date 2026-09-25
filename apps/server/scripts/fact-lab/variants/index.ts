import type { Variant } from "../schema";
import { baseline } from "./baseline";
import { current, fitted, sized } from "./current";

/**
 * Registered variants: the production collector, the best version and its size-limited
 * successors. A variant is immutable once it has run; add a new one to try a change. Earlier
 * iterations are in commit 70fd614.
 */
export const VARIANTS: Record<string, Variant> = Object.fromEntries(
  [baseline, current, sized, fitted].map((variant) => [variant.id, variant]),
);
