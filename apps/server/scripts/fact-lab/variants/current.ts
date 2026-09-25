import { engineVariant, type EngineSettings } from "./engine";

/** Thresholds calibrated on the labeled pages; see docs/audits/2026-09-25-fact-lab-cursor.md. */
const settings: EngineSettings = {
  before: 12,
  after: 4,
  reach: 10,
  contextLines: 3,
  kindThreshold: 0.6,
  nameThreshold: 0.7,
  nameLow: 0.3,
  nameMargin: 0.1,
};

/**
 * The best version from the lab iterations (engines v1–v16 in commit 70fd614). The engine was
 * consolidated after v16 without changing a request or a decision.
 */
export const current = engineVariant(
  {
    id: "names-v16a",
    parent: "names-v15a",
    hypothesis:
      "Best version: price windows and plan-name candidates in one Jev request per capture; code decides, and uncertain plan names go to review.",
  },
  settings,
);

/**
 * names-v16a with request size limits, so pages with 100+ prices or very long Markdown lines
 * fit Jev's input limits. Pages that already fit send the same requests unless a context line
 * or a price's terms exceed 300 characters.
 */
export const sized = engineVariant(
  {
    id: "names-v17a",
    parent: "names-v16a",
    hypothesis:
      "Capping context lines at 300 characters and splitting requests at 90 KB (60 KB of state) lets every registered page run, without changing results on pages that already fit.",
  },
  { ...settings, maxLineChars: 300, maxRequestBytes: 90_000, maxStateBytes: 60_000 },
);
