import { namesVariantV9, type NamesV9Settings } from "./names-engine-v9";

const base: NamesV9Settings = {
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
  nameExamples: false,
};

export const namesV9Variants = [
  namesVariantV9(
    {
      id: "names-v9a",
      parent: "names-v8a",
      hypothesis:
        "Price pairs share terms, ranges are skipped, and promotional or third-party kinds remove false usage and discount facts.",
    },
    base,
  ),
  namesVariantV9(
    {
      id: "names-v9b",
      parent: "names-v9a",
      hypothesis:
        "Generic examples in the plan-name Noul criteria reject section titles and descriptions.",
    },
    { ...base, nameExamples: true },
  ),
];
