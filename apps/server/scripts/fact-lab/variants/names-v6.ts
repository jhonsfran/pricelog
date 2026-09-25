import { namesVariantV6, type NamesV6Settings } from "./names-engine-v6";

const base: NamesV6Settings = {
  before: 12,
  after: 4,
  reach: 10,
  contextLines: 3,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  usdStatement: true,
  jsonLdNames: true,
};

export const namesV6Variants = [
  namesVariantV6(
    {
      id: "names-v6a",
      parent: "names-v5a",
      hypothesis:
        "Tier tabs anywhere in the card count, the attribution walk stops at other prices and inherits a sibling's plan, and shorter windows cut tokens without losing accuracy.",
    },
    base,
  ),
  namesVariantV6(
    {
      id: "names-v6b",
      parent: "names-v6a",
      hypothesis: "Without vendor JSON-LD names, v6 attribution still holds.",
    },
    { ...base, jsonLdNames: false },
  ),
];
