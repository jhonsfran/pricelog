import { describe, expect, it } from "vitest";
import type { PublishedSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { confirmChanges, diffSnapshots } from "./snapshot-changes";

const base: PublishedSnapshot = {
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [
    {
      name: "Starter",
      prices: [
        {
          kind: "flat",
          price_raw: "$80/month",
          price_numeric: 80,
          period: "month",
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

  it("reports a price change, an added shared price, a removed plan and a feature change", () => {
    const after: PublishedSnapshot = {
      ...structuredClone(base),
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
      shared_prices: [
        {
          kind: "usage",
          price_raw: "Extra emails: $0.90 / 1,000",
          price_numeric: 0.9,
          period: "usage",
          billing: "usage",
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
        key: "offer:Legacy",
        label: "Legacy plan",
        kind: "commercial",
        beforeLabel: "Listed",
        afterLabel: "Not listed",
        beforeEvidence: "Legacy",
        afterEvidence: "",
      },
      {
        key: "price:Starter:flat:monthly:month",
        label: "Starter monthly price",
        kind: "commercial",
        beforeLabel: "$80/month",
        afterLabel: "$90/month",
        beforeEvidence: "$80/month",
        afterEvidence: "$90/month",
      },
      {
        key: "rate:all:Extra emails: / 1,000:usage",
        label: "Extra emails: / 1,000 (all plans)",
        kind: "commercial",
        beforeLabel: "Not listed",
        afterLabel: "Extra emails: $0.90 / 1,000",
        beforeEvidence: "",
        afterEvidence: "Extra emails: $0.90 / 1,000",
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
