import { namesVariantV8, type NamesV8Settings } from "./names-engine-v8";

const base: NamesV8Settings = {
  before: 12,
  after: 4,
  reach: 10,
  contextLines: 3,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  usdStatement: true,
  jsonLdNames: true,
  kindWording: "full",
  nameWording: "full",
  pluralDedupe: true,
};

export const namesV8Variants = [
  namesVariantV8(
    {
      id: "names-v8a",
      parent: "names-v7b",
      hypothesis:
        "Sibling inheritance only without a rejected name in between, plus capitalized name candidates, turns name false negatives into abstentions instead of wrong plans. Full wording.",
    },
    base,
  ),
  namesVariantV8(
    {
      id: "names-v8b",
      parent: "names-v8a",
      hypothesis: "Compact kind wording with full name wording keeps v8a accuracy at fewer tokens.",
    },
    { ...base, kindWording: "compact" },
  ),
  namesVariantV8(
    {
      id: "names-v8c",
      parent: "names-v8a",
      hypothesis:
        "With the safety rules, fully compact wording is safe (misses become abstentions).",
    },
    { ...base, kindWording: "compact", nameWording: "compact" },
  ),
];
