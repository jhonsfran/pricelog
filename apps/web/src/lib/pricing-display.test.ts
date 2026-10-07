import type { PublishedPrice, PublishedSnapshot } from "@pricelog/api/pricing-snapshot";
import { planOffers } from "@pricelog/api/pricing-snapshot";
import { describe, expect, it } from "vitest";
import {
  billingViews,
  defaultBilling,
  displayPrice,
  entryLabel,
  featureRows,
  headlinePrice,
  otherQuotes,
  planColumns,
  priceLadder,
} from "@pricelog/api/pricing-display";

const price = (overrides: Partial<PublishedPrice>): PublishedPrice => ({
  kind: "flat",
  price_raw: "$80 | /month",
  price_numeric: 80,
  period: "month",
  billing: "monthly",
  state: "default",
  ...overrides,
});

const snapshot = (overrides: Partial<PublishedSnapshot>): PublishedSnapshot => ({
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [],
  features: [],
  ...overrides,
});

describe("displayPrice", () => {
  it("sets the verified amount in the quoted currency with its unit", () => {
    expect(displayPrice(price({}))).toEqual({ amount: "$80", unit: "/mo" });
    expect(
      displayPrice(
        price({ kind: "per_seat", price_raw: "€24.99", price_numeric: 24.99, period: "none" }),
      ),
    ).toEqual({ amount: "€24.99", unit: "/seat" });
    expect(
      displayPrice(
        price({ kind: "usage", price_raw: "$0.21 /hr", price_numeric: 0.21, period: "usage" }),
      ),
    ).toEqual({ amount: "$0.21", unit: "/hr" });
  });

  it("names free and custom plans, and keeps a quote without a currency as printed", () => {
    expect(
      displayPrice(price({ kind: "free", price_raw: "$0 | /month", price_numeric: 0 })).amount,
    ).toBe("$0");
    expect(
      displayPrice(price({ kind: "free", price_raw: "Try our API for free", price_numeric: null }))
        .amount,
    ).toBe("Free");
    expect(displayPrice(price({ kind: "custom", price_raw: "0 USD" })).amount).toBe("Custom");
    expect(displayPrice(price({ price_raw: "80 | a month" }))).toEqual({
      amount: "80 a month",
      unit: null,
    });
  });
});

describe("headline and other quotes", () => {
  const monthly = price({});
  const annual = price({ price_raw: "$64 | /month", price_numeric: 64, billing: "annual" });
  const structured = price({ price_raw: "80 USD", period: "none", state: "structured data" });

  it("leads with the price billed the chosen way, preferring the visible page", () => {
    expect(headlinePrice([structured, annual, monthly], "monthly")).toBe(monthly);
    expect(headlinePrice([structured, annual, monthly], "annual")).toBe(annual);
    expect(headlinePrice([structured, monthly], null)).toBe(monthly);
  });

  it("drops quotes that repeat the headline figure", () => {
    expect(otherQuotes([monthly, structured, annual], monthly)).toEqual([annual]);
    const custom = price({ kind: "custom", price_raw: "Custom", price_numeric: null });
    const structuredCustom = price({ kind: "custom", price_raw: "0 USD", price_numeric: 0 });
    expect(otherQuotes([custom, structuredCustom], custom)).toEqual([]);
  });
});

describe("billing views", () => {
  it("offers a switch only when some plan prices both views", () => {
    const both = snapshot({
      billing_view: "annual",
      offers: [{ name: "Starter", prices: [price({}), price({ billing: "annual" })] }],
    });
    expect(billingViews(both)).toEqual(["monthly", "annual"]);
    expect(defaultBilling(both)).toBe("annual");
    expect(
      billingViews(snapshot({ offers: [{ name: "Free", prices: [price({ kind: "free" })] }] })),
    ).toEqual([]);
  });
});

describe("plan grid", () => {
  it("counts recurring, usage, free and custom plans without counting separate add-ons", () => {
    const page = snapshot({
      offers: [
        { name: "Basic", prices: [price({ kind: "free" })] },
        { name: "Starter", prices: [price({ kind: "per_seat" })] },
        { name: "Enterprise", prices: [price({ kind: "custom" })] },
        { name: "AI Copilot", prices: [price({ kind: "add_on" })] },
        { name: "Self Serve", prices: [price({ kind: "usage" })] },
      ],
    });
    expect(planOffers(page).map((offer) => offer.name)).toEqual([
      "Basic",
      "Starter",
      "Enterprise",
      "Self Serve",
    ]);
  });
  it("adds plans only the feature grid names and splits out rows no plan offers", () => {
    const page = snapshot({
      offers: [{ name: "Pro", prices: [price({})] }],
      features: [
        {
          name: "Seats",
          availability: [
            { offer: "Pro", status: "limited", limit_raw: "3" },
            { offer: "Team", status: "included" },
          ],
        },
        { name: "Voice", availability: [{ offer: "Pro", status: "not_included" }] },
      ],
    });
    const columns = planColumns(page);
    expect(columns.map((column) => column.name)).toEqual(["Pro", "Team"]);
    const rows = featureRows(page.features, columns);
    expect(rows.offered.map((row) => row.cells)).toEqual([
      [
        { status: "limited", limit: "3" },
        { status: "included", limit: undefined },
      ],
    ]);
    expect(rows.absent.map((row) => row.name)).toEqual(["Voice"]);
  });

  it("reads icon labels printed in place of a value", () => {
    const page = snapshot({
      features: [
        {
          name: "Sentiment",
          availability: [
            { offer: "Pro", status: "limited", limit_raw: "[available]" },
            { offer: "Team", status: "limited", limit_raw: "[not-available]" },
          ],
        },
      ],
    });
    expect(featureRows(page.features, planColumns(page)).offered[0]!.cells).toEqual([
      { status: "included" },
      { status: "not_included" },
    ]);
  });
});

describe("price ladder and entry label", () => {
  const page = snapshot({
    offers: [
      { name: "Enterprise", prices: [price({ kind: "custom", price_raw: "Custom" })] },
      { name: "Team", prices: [price({ price_raw: "$750/mo", price_numeric: 750 })] },
      { name: "Free", prices: [price({ kind: "free", price_raw: "$0" })] },
      {
        name: "Plus",
        prices: [price({ price_raw: "$1,800/yr", price_numeric: 1800, period: "year" })],
      },
    ],
  });

  it("climbs from free through paid plans by monthly equivalent to custom", () => {
    expect(priceLadder(page).map((step) => [step.plan, step.amount])).toEqual([
      ["Free", 0],
      ["Plus", 150],
      ["Team", 750],
      ["Enterprise", null],
    ]);
  });

  it("starts at the cheapest paid plan, then a usage rate, then free or custom", () => {
    expect(entryLabel(page)).toBe("$1,800/yr");
    expect(
      entryLabel(
        snapshot({
          shared_prices: [
            price({ kind: "usage", price_raw: "$0.15 /hr", price_numeric: 0.15, period: "usage" }),
          ],
        }),
      ),
    ).toBe("$0.15/hr");
    expect(
      entryLabel(
        snapshot({
          shared_prices: [
            price({ price_raw: "$199 /mo", price_numeric: 199 }),
            price({ price_raw: "$79 /mo", price_numeric: 79 }),
          ],
        }),
      ),
    ).toBe("$79/mo");
    expect(entryLabel(snapshot({ status: "unavailable" }))).toBeNull();
  });
});
