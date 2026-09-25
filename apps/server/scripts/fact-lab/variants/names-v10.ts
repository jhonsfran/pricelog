import { namesVariantV10, type NamesV10Settings } from "./names-engine-v10";

const base: NamesV10Settings = {
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

/** A threshold grid over identical requests: every cell after the first is answered from cache. */
const grid = [0.4, 0.5, 0.6].flatMap((kind) =>
  [0.5, 0.6, 0.7].map((name) =>
    namesVariantV10(
      {
        id: `names-v10-k${kind}-n${name}`,
        parent: "names-v9b",
        hypothesis: `Threshold calibration on labeled pages: kind ≥ ${kind}, plan name ≥ ${name}.`,
      },
      { ...base, kindThreshold: kind, nameThreshold: name },
    ),
  ),
);

export const namesV10Variants = [
  namesVariantV10(
    {
      id: "names-v10a",
      parent: "names-v9b",
      hypothesis:
        "Best-in-card attribution picks the strongest plan name before a card boundary; same-line kind agreement and field-merging dedupe remove the last v9 errors.",
    },
    base,
  ),
  ...grid,
];
