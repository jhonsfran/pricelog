import { windowsVariant, type WindowsSettings } from "./windows-engine-v4";

const base: WindowsSettings = {
  chunk: Number.POSITIVE_INFINITY,
  before: 8,
  after: 4,
  kindThreshold: 0.6,
  planThreshold: 0.5,
  usdStatement: true,
  dedupe: true,
};

export const windowsV4Variants = [
  windowsVariant(
    {
      id: "windows-v4a",
      parent: "cards-v3c",
      hypothesis:
        "Price windows (nearby lines, code-read terms, bounded plan options) generalize past heading-based cards: works without headings, reads multi-line terms, supports usage and outcome prices, a page USD statement, and deduplicates restatements.",
    },
    base,
  ),
];
