import { describe, expect, it } from "vitest";
import type { NumericOffer, NumericPrices } from "@pricelog/db/numeric-prices";
import { buildNumericBenchmark, monthlyEquivalent } from "./numeric-prices";

const offer = (amount: string, patch: Partial<NumericOffer> = {}): NumericOffer => ({
  amount,
  currency: "USD",
  billing: "monthly",
  amountPeriod: "month",
  chargeUnit: "flat",
  evidence: `Pro USD ${amount}/month`,
  plan: "Pro",
  includedUsage: null,
  overage: null,
  confidence: 0.99,
  ...patch,
});
const page = (...offers: NumericOffer[]) => ({
  numericPrices: {
    version: "numeric-prices-v1",
    status: "collected",
    model: "jev-1.13.0",
    offers,
  } satisfies NumericPrices,
});

describe("numeric price comparisons", () => {
  it("normalizes annual totals while retaining separate commitment, currency and seat groups", () => {
    const snapshot = buildNumericBenchmark([
      page(offer("20")),
      page(offer("40")),
      page(offer("30")),
      page(offer("240", { billing: "annual", amountPeriod: "year" })),
      page(offer("20", { currency: "EUR" })),
      page(offer("20", { chargeUnit: "seat" })),
    ]);
    expect(snapshot.groups).toHaveLength(4);
    expect(
      snapshot.groups.find(
        (g) => g.currency === "USD" && g.billing === "monthly" && g.chargeUnit === "flat",
      ),
    ).toMatchObject({ count: 3, minimum: 20, median: 30, maximum: 40 });
    expect(snapshot.groups.find((g) => g.billing === "annual")).toMatchObject({
      count: 1,
      median: null,
    });
    expect(monthlyEquivalent(offer("240", { billing: "annual", amountPeriod: "year" }))).toBe(20);
    expect(monthlyEquivalent(offer("20", { billing: "annual" }))).toBe(20);
  });
  it("uses one cheapest observation per product and does not let duplicates create a sample", () => {
    const result = buildNumericBenchmark([
      page(offer("10"), offer("20"), offer("30")),
      page(offer("40")),
    ]);
    expect(result.groups[0]).toMatchObject({
      count: 2,
      median: null,
      minimum: null,
      maximum: null,
    });
  });
  it("reports collection coverage and excludes free, ambiguous and invalid offers", () => {
    const result = buildNumericBenchmark([
      {},
      { numericPrices: null },
      {
        numericPrices: {
          version: "numeric-prices-v1",
          status: "unavailable",
          model: null,
          offers: [],
        },
      },
      page(
        offer("0"),
        offer("1e2"),
        offer("10", { confidence: 0.5 }),
        offer("10", { evidence: "" }),
      ),
      page(offer("15")),
    ]);
    expect(result).toMatchObject({ notCollected: 2, unavailable: 1, collected: 2, withOffers: 1 });
    expect(result.groups[0]?.count).toBe(1);
    expect(monthlyEquivalent(offer("240", { amountPeriod: "year" }))).toBeNull();
    expect(monthlyEquivalent(offer("NaN"))).toBeNull();
  });
  it("shows unspecified dollar offers in coverage without mixing them into currency groups", () => {
    const result = buildNumericBenchmark([page(offer("20", { currency: "DOLLAR_UNSPECIFIED" }))]);
    expect(result.withOffers).toBe(1);
    expect(result.groups).toEqual([]);
  });
  it("uses the midpoint for even sample medians", () => {
    expect(
      buildNumericBenchmark([10, 20, 50, 100].map((v) => page(offer(String(v))))).groups[0]?.median,
    ).toBe(35);
  });
});
