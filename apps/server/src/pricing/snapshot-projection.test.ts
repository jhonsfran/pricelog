import { describe, expect, it } from "vitest";
import type { PublishedSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { numericPricesFromSnapshot } from "./snapshot-projection";

const price = (price_raw: string, amount: number, billing: "monthly" | "annual" | "unknown") => ({
  role: "base_price" as const,
  price_raw,
  price_numeric: amount,
  period: "month" as const,
  unit: "flat" as const,
  billing,
  state: "default",
});

const snapshot: PublishedSnapshot = {
  version: "pricing-snapshot-v3",
  status: "collected",
  billing_view: "monthly",
  flags: {},
  offers: [
    {
      name: "Free",
      prices: [
        {
          role: "free_plan",
          price_raw: "$0/month",
          price_numeric: 0,
          period: "month",
          unit: "flat",
          billing: "unknown",
          state: "default",
        },
      ],
    },
    {
      name: "Starter",
      prices: [price("$80/month", 80, "monthly"), price("$64/month", 64, "annual")],
    },
    {
      name: "Team",
      prices: [
        { ...price("€20 per user/month", 20, "unknown"), role: "seat_price", unit: "per_seat" },
      ],
    },
    { name: "Enterprise", prices: [{ ...price("Custom", 0, "unknown"), role: "custom_price" }] },
  ],
  features: [],
};

describe("numeric prices from a snapshot", () => {
  it("keeps subscription prices with amount, currency, period and billing", () => {
    expect(numericPricesFromSnapshot(snapshot, "jev-1.13.0")).toEqual({
      version: "numeric-prices-v1",
      status: "collected",
      model: "jev-1.13.0",
      offers: [
        {
          billing: "monthly",
          chargeUnit: "flat",
          amount: "80",
          currency: "USD",
          amountPeriod: "month",
          evidence: "$80/month",
          plan: "Starter",
          includedUsage: null,
          overage: null,
          confidence: 0.9,
        },
        {
          billing: "annual",
          chargeUnit: "flat",
          amount: "64",
          currency: "USD",
          amountPeriod: "month",
          evidence: "$64/month",
          plan: "Starter",
          includedUsage: null,
          overage: null,
          confidence: 0.9,
        },
        {
          billing: "monthly",
          chargeUnit: "seat",
          amount: "20",
          currency: "EUR",
          amountPeriod: "month",
          evidence: "€20 per user/month",
          plan: "Team",
          includedUsage: null,
          overage: null,
          confidence: 0.9,
        },
      ],
    });
  });

  it("is unavailable when no price qualifies", () => {
    expect(
      numericPricesFromSnapshot(
        { ...snapshot, billing_view: undefined, offers: [snapshot.offers[0]!] },
        "jev-1.13.0",
      ),
    ).toMatchObject({ status: "unavailable", offers: [] });
  });
});
