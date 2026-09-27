import { describe, expect, it } from "vitest";
import {
  monetizationMetrics,
  type PublishedPrice,
  type PublishedSnapshot,
} from "./pricing-snapshot";

const price = (
  kind: PublishedPrice["kind"],
  price_raw: string,
  price_numeric: number | null,
  period: PublishedPrice["period"],
  billing: PublishedPrice["billing"],
): PublishedPrice => ({ kind, price_raw, price_numeric, period, billing, state: "default" });

const snapshot = (fields: Partial<PublishedSnapshot>): PublishedSnapshot => ({
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [],
  features: [],
  ...fields,
});

describe("monetization metrics", () => {
  it("computes annual discounts, the entry price and the price ladder from plan prices", () => {
    const metrics = monetizationMetrics(
      snapshot({
        offers: [
          { name: "Free", prices: [price("free", "$0 /month", 0, "none", "unknown")] },
          {
            name: "Starter",
            prices: [
              price("flat", "$80 /month", 80, "month", "monthly"),
              price("flat", "$64 | /month", 64, "month", "annual"),
            ],
          },
          {
            name: "Team",
            prices: [
              price("flat", "$200 /month", 200, "month", "monthly"),
              price("flat", "$160 | /month", 160, "month", "annual"),
            ],
          },
        ],
      }),
    );
    expect(metrics).toEqual({
      annual_discount: {
        plans: [
          { plan: "Starter", percent: 20 },
          { plan: "Team", percent: 20 },
        ],
        median: 20,
      },
      entry_price: { plan: "Starter", amount: 80, currency: "USD" },
      price_ladder: {
        tiers: [
          { plan: "Starter", amount: 80 },
          { plan: "Team", amount: 200 },
        ],
        currency: "USD",
        ratio: 2.5,
      },
    });
  });

  it("prices an included unit and compares overage with it", () => {
    const metrics = monetizationMetrics(
      snapshot({
        offers: [{ name: "Pro", prices: [price("flat", "$29/mo", 29, "month", "monthly")] }],
        shared_prices: [price("usage", "$0.20 / extra minute", 0.2, "usage", "usage")],
        features: [
          {
            name: "Minutes included",
            availability: [{ offer: "Pro", status: "limited", limit_raw: "300" }],
          },
        ],
      }),
      "minutes",
    );
    expect(metrics.effective_unit_price).toEqual([
      {
        plan: "Pro",
        unit: "minute",
        included: 300,
        per_unit: 0.0967,
        per_thousand: 96.67,
        currency: "USD",
      },
    ]);
    expect(metrics.overage_markup).toEqual([
      { quote: "$0.20 / extra minute", unit: "minute", per_unit: 0.2, plan: "Pro", markup: 2.07 },
    ]);
  });

  it("reads per-1,000 rates and skips relative allowances", () => {
    const metrics = monetizationMetrics(
      snapshot({
        offers: [
          { name: "Starter", prices: [price("flat", "$50 /month", 50, "month", "monthly")] },
          { name: "Scale", prices: [price("flat", "$400 /month", 400, "month", "monthly")] },
        ],
        shared_prices: [price("usage", "$10 | per 1,000 credits", 10, "usage", "usage")],
        features: [
          {
            name: "Monthly credits",
            availability: [
              { offer: "Starter", status: "limited", limit_raw: "5K" },
              { offer: "Scale", status: "limited", limit_raw: "10x" },
            ],
          },
        ],
      }),
    );
    expect(metrics.effective_unit_price).toEqual([
      {
        plan: "Starter",
        unit: "credit",
        included: 5000,
        per_unit: 0.01,
        per_thousand: 10,
        currency: "USD",
      },
    ]);
    expect(metrics.overage_markup).toEqual([
      {
        quote: "$10 | per 1,000 credits",
        unit: "credit",
        per_unit: 0.01,
        plan: "Starter",
        markup: 1,
      },
    ]);
  });

  it("leaves out what the facts do not settle", () => {
    expect(
      monetizationMetrics(
        snapshot({
          offers: [
            { name: "Team", prices: [price("per_seat", "€25 per user", 25, "month", "monthly")] },
            { name: "Pro", prices: [price("flat", "$30 /month", 30, "month", "monthly")] },
            { name: "Enterprise", prices: [price("custom", "Custom", null, "none", "unknown")] },
          ],
        }),
      ),
    ).toEqual({});
  });
});
