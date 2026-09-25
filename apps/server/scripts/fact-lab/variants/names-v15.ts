import { namesVariantV15, type NamesV15Settings } from "./names-engine-v15";

const base: NamesV15Settings = {
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

export const namesV15Variants = [
  namesVariantV15(
    {
      id: "names-v15a",
      parent: "names-v14a",
      hypothesis:
        "Credit-denominated usage prices are credit purchases (schema rule), removing the last chatbase error.",
    },
    base,
  ),
];
