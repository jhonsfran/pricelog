import { describe, expect, it, vi } from "vitest";
import type { PublishedSnapshot } from "@pricelog/db/pricing-snapshot";
import { verifiedVersionChanges } from "./version-changes";

const snapshot = (amount: number): PublishedSnapshot => ({
  version: "pricing-snapshot-v4",
  status: "collected",
  currency_visible: "USD",
  offers: [
    {
      name: "Starter",
      prices: [
        {
          kind: "flat",
          price_raw: `$${amount}/month`,
          price_numeric: amount,
          period: "month",
          billing: "monthly",
          state: "default",
        },
      ],
    },
  ],
  features: [],
});

const pages: Record<string, string> = {
  before: "Starter $80/month",
  after: "Starter $90/month",
  same: "Starter $80/month",
};
const read = async (key: string) => pages[key] ?? null;
const version = (contentKey: string, amount: number, model = "jev-1") => ({
  contentKey,
  model,
  snapshot: snapshot(amount),
});

describe("verified version changes", () => {
  it("reports a price change that both archived pages show", async () => {
    const changes = await verifiedVersionChanges(version("before", 80), version("after", 90), read);
    expect(changes?.map((change) => [change.beforeLabel, change.afterLabel])).toEqual([
      ["$80/month", "$90/month"],
    ]);
  });

  it("drops an extraction difference the pages do not show", async () => {
    expect(await verifiedVersionChanges(version("before", 80), version("same", 90), read)).toEqual(
      [],
    );
  });

  it("does not read archives when there are no candidate changes", async () => {
    const readContent = vi.fn(read);
    expect(
      await verifiedVersionChanges(version("before", 80), version("same", 80), readContent),
    ).toEqual([]);
    expect(readContent).not.toHaveBeenCalled();
  });

  it("does not compare a first capture, another model, or a missing archive", async () => {
    expect(await verifiedVersionChanges(null, version("after", 90), read)).toBeNull();
    expect(
      await verifiedVersionChanges(version("before", 80), version("after", 90, "jev-2"), read),
    ).toBeNull();
    expect(
      await verifiedVersionChanges(version("gone", 80), version("after", 90), read),
    ).toBeNull();
  });
});
