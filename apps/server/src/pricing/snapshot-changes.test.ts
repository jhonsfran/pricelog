import { describe, expect, it } from "vitest";
import type { PublishedSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { confirmChanges, diffSnapshots } from "./snapshot-changes";

const base: PublishedSnapshot = {
  version: "pricing-snapshot-v3",
  status: "collected",
  flags: { has_free_plan: true },
  offers: [
    {
      name: "Starter",
      prices: [
        {
          role: "base_price",
          price_raw: "$80/month",
          price_numeric: 80,
          period: "month",
          unit: "flat",
          billing: "monthly",
          state: "default",
        },
      ],
    },
    { name: "Legacy", prices: [] },
  ],
  features: [
    {
      name: "Team members",
      availability: [{ offer: "Starter", status: "limited", limit_raw: "5" }],
    },
  ],
};

describe("snapshot diff", () => {
  it("finds nothing between identical snapshots", () => {
    expect(diffSnapshots(base, structuredClone(base))).toEqual([]);
  });

  it("reports a price change, an added rate, a removed plan, a feature change and a flag flip", () => {
    const after: PublishedSnapshot = {
      ...structuredClone(base),
      flags: { has_free_plan: false },
      offers: [
        {
          name: "Starter",
          prices: [{ ...base.offers[0]!.prices[0]!, price_raw: "$90/month", price_numeric: 90 }],
        },
      ],
      features: [
        {
          name: "Team members",
          availability: [{ offer: "Starter", status: "limited", limit_raw: "10" }],
        },
      ],
      rates: [
        {
          name: "Extra emails",
          price_raw: "$0.90 / 1,000",
          price_numeric: 0.9,
          currency: "USD",
          per: "/ 1,000",
          offer: null,
          role: "overage_rate",
          state: "default",
        },
      ],
    };
    expect(diffSnapshots(base, after)).toEqual([
      {
        key: "feature:team members:Starter",
        label: "Team members (Starter)",
        kind: "disclosure",
        beforeLabel: "limited: 5",
        afterLabel: "limited: 10",
        beforeEvidence: "5",
        afterEvidence: "10",
      },
      {
        key: "flag:has_free_plan",
        label: "has free plan",
        kind: "disclosure",
        beforeLabel: "Yes",
        afterLabel: "No",
        beforeEvidence: "Stated on the page",
        afterEvidence: "Not stated",
      },
      {
        key: "offer:Legacy",
        label: "Legacy plan",
        kind: "commercial",
        beforeLabel: "Listed",
        afterLabel: "Not listed",
        beforeEvidence: "Legacy",
        afterEvidence: "",
      },
      {
        key: "price:Starter:base_price:monthly:month:flat",
        label: "Starter monthly price",
        kind: "commercial",
        beforeLabel: "$80/month",
        afterLabel: "$90/month",
        beforeEvidence: "$80/month",
        afterEvidence: "$90/month",
      },
      {
        key: "rate:all:Extra emails:/ 1,000",
        label: "Extra emails rate",
        kind: "commercial",
        beforeLabel: "Not listed",
        afterLabel: "$0.90 / 1,000",
        beforeEvidence: "",
        afterEvidence: "$0.90 / 1,000",
      },
    ]);
  });

  it("keeps only changes the captured pages show", () => {
    const change = (key: string, before: string, after: string) => ({
      key,
      label: key,
      kind: "commercial" as const,
      beforeLabel: before,
      afterLabel: after,
      beforeEvidence: before,
      afterEvidence: after,
    });
    const page = "## Basic\nIssues | Unlimited issues\n## Starter\n$80/month";
    const changed = "## Basic\nIssues | Unlimited issues\n## Starter\n$90/month";
    expect(
      confirmChanges(
        [
          change("feature:issues:Basic", "Unlimited issues", "Unlimited"),
          change("price:Starter:base_price:monthly:month:flat", "$80/month", "$90/month"),
          change("feature:seats:Basic", "included", "not included"),
        ],
        page,
        changed,
      ).map((item) => item.key),
    ).toEqual(["price:Starter:base_price:monthly:month:flat"]);
  });
});
