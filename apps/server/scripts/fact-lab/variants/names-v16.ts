import { namesVariantV16, type NamesV16Settings } from "./names-engine-v16";

const base: NamesV16Settings = {
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

export const namesV16Variants = [
  namesVariantV16(
    {
      id: "names-v16a",
      parent: "names-v15a",
      hypothesis:
        "Post-holdout bug fix: terms propagate through price chains (fathom.ai). Not validated on unseen pages.",
    },
    base,
  ),
];
