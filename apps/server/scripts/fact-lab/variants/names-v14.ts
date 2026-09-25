import { namesVariantV14, type NamesV14Settings } from "./names-engine-v14";

const base: NamesV14Settings = {
  before: 12,
  after: 4,
  reach: 10,
  contextLines: 3,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  nameLow: 0.3,
  nameMargin: 0.1,
  normalize: true,
  usdStatement: true,
  jsonLdNames: true,
  kindWording: "full",
  nameWording: "full",
  pluralDedupe: true,
  nameExamples: true,
  attribution: "best",
};

export const namesV14Variants = [
  namesVariantV14(
    {
      id: "names-v14a",
      parent: "names-v13a",
      hypothesis:
        "Unglued terms, head-noun usage units, word badges and state words above prices fix the final holdout errors (bolt.new, chatbase.co) without new errors on the other pages.",
    },
    base,
  ),
];
