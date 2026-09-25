import type { Variant } from "../schema";
import { baseline } from "./baseline";
import { cardsV1 } from "./cards-v1";
import { cardsV2Variants } from "./cards-v2";
import { cardsV3Variants } from "./cards-v3";
import { windowsV4Variants } from "./windows-v4";
import { namesV5Variants } from "./names-v5";
import { namesV6Variants } from "./names-v6";
import { namesV7Variants } from "./names-v7";
import { namesV8Variants } from "./names-v8";
import { namesV9Variants } from "./names-v9";
import { namesV10Variants } from "./names-v10";
import { namesV11Variants } from "./names-v11";
import { namesV12Variants } from "./names-v12";
import { namesV13Variants } from "./names-v13";
import { namesV14Variants } from "./names-v14";
import { namesV15Variants } from "./names-v15";
import { namesV16Variants } from "./names-v16";

/** Registered variants. A variant is immutable once it has run; add a child instead. */
export const VARIANTS: Record<string, Variant> = Object.fromEntries(
  [
    baseline,
    cardsV1,
    ...cardsV2Variants,
    ...cardsV3Variants,
    ...windowsV4Variants,
    ...namesV5Variants,
    ...namesV6Variants,
    ...namesV7Variants,
    ...namesV8Variants,
    ...namesV9Variants,
    ...namesV10Variants,
    ...namesV11Variants,
    ...namesV12Variants,
    ...namesV13Variants,
    ...namesV14Variants,
    ...namesV15Variants,
    ...namesV16Variants,
  ].map((variant) => [variant.id, variant]),
);
