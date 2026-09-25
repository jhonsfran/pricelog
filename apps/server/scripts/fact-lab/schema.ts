import type { FactBilling, FactPeriod, NumericFactRole } from "@my-better-t-app/db/pricing-facts";
import type { Capture } from "./captures";
import type { JevStats } from "./jev";
import type { Decide } from "../../src/pricing/change-verification";

/** Numeric roles from production plus explicit non-numeric price states. */
export type LabRole = NumericFactRole | "free_plan" | "custom_price";
export type Span = { text: string; start: number; end: number };

export type LabFact = {
  /** Purchasable offer name as displayed. Null means attribution was not established. */
  plan: string | null;
  role: LabRole;
  amount: string | null;
  unit: string | null;
  currency: string | null;
  period: FactPeriod;
  billing: FactBilling;
  quantity: string | null;
  quantityUnit: string | null;
  /** Literal price text in the archived Markdown. */
  evidence: Span;
  confidence: number;
  /** Optional corroboration from vendor structured data in the archived HTML. */
  corroboration?: { source: "json-ld"; text: string; currency: string | null }[];
};

export type LabResult = {
  variant: string;
  fingerprint: string;
  capture: string;
  status: "collected" | "unavailable";
  reason?: string;
  facts: LabFact[];
  /** Offer names seen only in unselected UI states (tabs, toggles). */
  hiddenOffers?: string[];
  abstentions: { reason: string; detail?: string }[];
  jev: JevStats;
};

export type Variant = {
  id: string;
  parent: string | null;
  hypothesis: string;
  /** Source files that define the variant; they feed its fingerprint. */
  files: string[];
  settings: Record<string, unknown>;
  extract(
    capture: Capture,
    decide: Decide,
  ): Promise<Omit<LabResult, "variant" | "fingerprint" | "capture" | "jev">>;
};

export type GoldStatus =
  | "in_capture"
  | "restatement"
  | "hidden_state"
  | "capture_gap"
  | "out_of_schema";
export type GoldFact = {
  id: string;
  status: GoldStatus;
  plan: string | null;
  /** Other acceptable names for the same offer, e.g. a card heading around a tier tab. */
  aliases?: string[];
  role: LabRole | string;
  amount: string | null;
  unit: string | null;
  currency: string | null;
  period: FactPeriod;
  billing: FactBilling;
  quantity: string | null;
  quantityUnit: string | null;
  /** Exact substring of the capture Markdown that a correct fact's evidence must contain. */
  literal: string | null;
  /** Fields where an extractor answering unknown is acceptable. */
  optional?: ("unit" | "currency" | "period" | "billing")[];
  /** Equivalent encodings, e.g. a free plan recorded as a zero base price. */
  alsoAccept?: { role: string; amount: string | null }[];
  note?: string;
};
export type Gold = {
  capture: string;
  domain: string;
  status: "draft" | "approved";
  uiState: Record<string, string>;
  facts: GoldFact[];
  notes?: string[];
};
