import { namesVariantV7, type NamesV7Settings } from "./names-engine-v7";

const base: NamesV7Settings = {
  before: 12,
  after: 4,
  reach: 10,
  contextLines: 3,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  usdStatement: true,
  jsonLdNames: true,
  wording: "full",
  pluralDedupe: false,
};

export const namesV7Variants = [
  namesVariantV7(
    {
      id: "names-v7a",
      parent: "names-v6a",
      hypothesis: "Compact question wording keeps accuracy and cuts input tokens substantially.",
    },
    { ...base, wording: "compact" },
  ),
  namesVariantV7(
    {
      id: "names-v7b",
      parent: "names-v7a",
      hypothesis:
        "Singular/plural plan-name dedupe removes Team/Teams duplicates without merging distinct plans.",
    },
    { ...base, wording: "compact", pluralDedupe: true },
  ),
];
