import { describe, expect, it } from "vitest";
import {
  extractNumericCandidates,
  offerNameCandidates,
  evidenceCandidates,
  hasBareDollar,
} from "./source-candidates";

describe("literal source candidates", () => {
  it("parses exact decimals and grouping without malformed numeric fragments", () => {
    expect(
      extractNumericCandidates(
        "USD $1,234.50 €0.002 £12 12,50 2e3 10% 11 % -20 abc30 1.2.3 01 20k",
      ).map((item) => item.amount),
    ).toEqual(["1234.50", "0.002", "12"]);
  });
  it.each(["$", "€", "USD $", "US$", "CAD $", "AUD $"])(
    "checks the literal currency marker %s",
    (marker) => {
      const source = `${marker}20 per month`;
      expect(hasBareDollar(source, extractNumericCandidates(source)[0]!)).toBe(marker === "$");
    },
  );
  it("copies table and heading names and evidence spans from the source", () => {
    const source =
      "# Models\n\n| Plan | Pro | Model 4.1 |\n|---|---|---|\n| Price | USD $10 | USD $20 |";
    expect(offerNameCandidates(source).map((item) => item.text)).toContain("Model 4.1");
    for (const item of [...offerNameCandidates(source), ...evidenceCandidates(source)])
      expect(source.slice(item.start, item.end)).toBe(item.text);
  });
  it("rejects Unicode negatives and apostrophe grouping without positive fragments", () => {
    expect(extractNumericCandidates("USD −20/month")).toEqual([]);
    expect(extractNumericCandidates("USD $1'234/month; 1’234 credits")).toEqual([]);
  });
  it("rejects source overflows without truncation", () => {
    expect(() => extractNumericCandidates("1 ".repeat(513))).toThrow("candidate limit");
  });
  it("distinguishes Markdown price bullets from negative amounts", () => {
    const text =
      "- $20/month\n  - USD 30 per month\n\t- €40/month\n-$50/month\n−€60/month\nDiscount - USD 70 per month";
    expect(extractNumericCandidates(text).map((candidate) => candidate.amount)).toEqual([
      "20",
      "30",
      "40",
    ]);
  });
  it.each([" ", "\u00a0", "\u202f", "\t"])(
    "rejects every fragment of unsupported whitespace grouping with %j",
    (separator) => {
      expect(
        extractNumericCandidates(
          `€1${separator}234/month; ${separator}12${separator}345${separator}678 requests/month`,
        ),
      ).toEqual([]);
      expect(extractNumericCandidates(`€1${separator}000/month`)).toEqual([]);
    },
  );
  it.each(["trillion", "hundred", "k", "M", "bn", "MM"])(
    "rejects unsupported numeric scale %s without expansion",
    (scale) => {
      expect(extractNumericCandidates(`$1 ${scale}/year; includes 2.5 ${scale} tokens`)).toEqual(
        [],
      );
    },
  );
  it("normalizes explicit scale words in code without floating point", () => {
    expect(
      extractNumericCandidates(
        "1 million tokens, 2.5 thousand requests, 0.000123 million units",
      ).map((item) => item.amount),
    ).toEqual(["1000000", "2500", "123"]);
  });
  it("keeps separate values outside unsupported grouped spans", () => {
    expect(
      extractNumericCandidates(
        "20 30; 1000 2000; | 1 | 234 |; 1\n234; 10 requests and 200 tokens",
      ).map((candidate) => candidate.amount),
    ).toEqual(["20", "30", "1000", "2000", "1", "234", "1", "234", "10", "200"]);
    expect(
      extractNumericCandidates("$0.02 per million tokens").map((candidate) => candidate.amount),
    ).toEqual(["0.02", "1000000"]);
  });
});
