import { namesVariantV13, type NamesV13Settings } from "./names-engine-v13";

const base: NamesV13Settings = {
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

export const namesV13Variants = [
  namesVariantV13(
    {
      id: "names-v13a",
      parent: "names-v12a",
      hypothesis:
        "Price windows v3 read unit lines after symbol-only suffixes, so paired promotional blocks keep per-user terms.",
    },
    base,
  ),
];
