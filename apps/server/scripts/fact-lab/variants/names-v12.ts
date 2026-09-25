import { namesVariantV12, type NamesV12Settings } from "./names-engine-v12";

const base: NamesV12Settings = {
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

export const namesV12Variants = [
  namesVariantV12(
    {
      id: "names-v12a",
      parent: "names-v11-k0.6-n0.5",
      hypothesis:
        "Noise-free lines make noise-only captures send identical requests, and a 0.3–0.7 plan-name band with a 0.1 margin turns sampling flips into review items instead of wrong facts.",
    },
    base,
  ),
];
