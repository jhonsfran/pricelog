import { namesVariantV11, type NamesV11Settings } from "./names-engine-v11";

const base: NamesV11Settings = {
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
  nameExamples: true,
  attribution: "best",
};

/** Threshold grid over identical requests; cells after the first are answered from cache. */
export const namesV11Variants = [0.3, 0.4, 0.5, 0.6].flatMap((kind) =>
  [0.5, 0.6, 0.7, 0.8].map((name) =>
    namesVariantV11(
      {
        id: `names-v11-k${kind}-n${name}`,
        parent: "names-v10a",
        hypothesis: `Promotional exclusion at any confidence; thresholds kind ≥ ${kind}, plan name ≥ ${name}.`,
      },
      { ...base, kindThreshold: kind, nameThreshold: name },
    ),
  ),
);
