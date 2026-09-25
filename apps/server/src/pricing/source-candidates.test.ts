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
  it("keeps long pages with many short paragraphs inside the evidence choice limit", () => {
    const source = Array.from({ length: 300 }, (_, index) =>
      index === 250 ? "## Business\n£572/mo, billed annually" : "Feature description",
    ).join("\n\n");
    const price = extractNumericCandidates(source).find((item) => item.amount === "572")!;
    const passages = evidenceCandidates(source);
    expect(passages.length).toBeLessThanOrEqual(254);
    expect(passages.some((item) => item.start <= price.start && item.end >= price.end)).toBe(true);
    for (const item of passages) expect(source.slice(item.start, item.end)).toBe(item.text);
  });
  it("does not split a price in a long line across evidence passages", () => {
    const source = `${"x".repeat(1197)} £572/mo, billed annually`;
    const price = extractNumericCandidates(source)[0]!;
    expect(price.amount).toBe("572");
    expect(
      evidenceCandidates(source).some((item) => item.start <= price.start && item.end >= price.end),
    ).toBe(true);
  });
  it("bounds evidence passages when a line has no nearby whitespace", () => {
    const source = `${"x".repeat(50_000)}\n## Pro\nUSD $20 per month`;
    const passages = evidenceCandidates(source);
    const price = extractNumericCandidates(source)[0]!;
    expect(Math.max(...passages.map((item) => item.text.length))).toBeLessThanOrEqual(1200);
    expect(passages.some((item) => item.start <= price.start && item.end >= price.end)).toBe(true);
  });
  it("rejects Unicode negatives and apostrophe grouping without positive fragments", () => {
    expect(extractNumericCandidates("USD −20/month")).toEqual([]);
    expect(extractNumericCandidates("USD $1'234/month; 1’234 credits")).toEqual([]);
  });
  it("keeps numeric candidates beyond one Jev Choice menu", () => {
    expect(extractNumericCandidates("1 ".repeat(513))).toHaveLength(513);
  });
  it("does not treat every feature sentence as an offer name", () => {
    const source = [
      "## Pro",
      "$20/month",
      ...Array.from({ length: 513 }, (_, index) => `Feature ${index} details`),
    ].join("\n");
    expect(offerNameCandidates(source).map((item) => item.text)).toContain("Pro");
    expect(offerNameCandidates(source).length).toBeLessThan(20);
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
