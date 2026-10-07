import { describe, expect, it } from "vitest";
import {
  archiveFindings,
  billingInLabel,
  readDirectory,
  snapshotFindings,
  summarize,
} from "./audit-pricing.mjs";

const price = (overrides = {}) => ({
  kind: "flat",
  price_raw: "$20 /month",
  price_numeric: 20,
  period: "month",
  billing: "monthly",
  state: "default",
  ...overrides,
});
const snapshot = (overrides = {}) => ({
  version: "pricing-snapshot-v4",
  status: "collected",
  offers: [{ name: "Starter", prices: [price()] }],
  features: [],
  ...overrides,
});

describe("published pricing audit", () => {
  it("finds add-ons counted as plans without removing a usage-priced plan", () => {
    const findings = snapshotFindings(
      snapshot({
        offers: [
          {
            name: "Self Serve",
            prices: [price({ kind: "usage", billing: "usage", period: "usage" })],
          },
          { name: "Extra agents", prices: [price({ kind: "add_on" })] },
        ],
      }),
    );
    expect(findings.find((finding) => finding.rule === "add_ons_counted_as_plans")).toEqual({
      rule: "add_ons_counted_as_plans",
      severity: "confirmed",
      names: ["Extra agents"],
    });
  });

  it("treats volume prices and absent features as review cases", () => {
    const findings = snapshotFindings(
      snapshot({
        offers: [
          { name: "Team", prices: [price(), price({ price_numeric: 40, state: "2 editors" })] },
        ],
      }),
    );
    expect(findings.map((finding) => [finding.rule, finding.severity])).toEqual([
      ["no_features", "review"],
      ["multiple_prices_same_billing", "review"],
    ]);
    expect(
      snapshotFindings(snapshot({ offers: [], shared_prices: [price({ kind: "usage" })] })).some(
        (finding) => finding.rule === "empty_collected_snapshot",
      ),
    ).toBe(false);
  });

  it("checks annual billing against the exact archive block containing the quote", () => {
    const source =
      "## state: default (selected: Yearly)\nStarter $20 /month\n## state: billing=Monthly\nStarter $25 /month";
    expect(archiveFindings(snapshot(), source)).toMatchObject([
      {
        rule: "billing_evidence_mismatch",
        severity: "confirmed",
        offer: "Starter",
        expected: "annual",
      },
    ]);
    expect(
      archiveFindings(
        snapshot({ offers: [{ name: "Starter", prices: [price({ price_raw: "$99 /month" })] }] }),
        source,
      ),
    ).toEqual([]);
  });

  it("does not infer billing from a control label that names both cycles", () => {
    const state = "billing=Monthly Annually; Team minutes=1";
    const source = `## state: ${state}\nTeam $2112 Billed annually`;
    const findings = archiveFindings(
      snapshot({
        offers: [
          {
            name: "Team",
            prices: [price({ price_raw: "$2112 Billed annually", billing: "annual", state })],
          },
        ],
      }),
      source,
    );
    expect(findings.map((finding) => finding.rule)).toEqual(["ambiguous_billing_control"]);
    expect(billingInLabel("Monthly Annual 50% OFF")).toBeNull();
    expect(
      archiveFindings(snapshot(), "## state: default (selected: 1-4)\nStarter $20 /month"),
    ).toEqual([]);
  });

  it("returns every directory batch and rejects an incomplete inventory", async () => {
    const calls = [];
    const batches = [
      { total: 2, items: [{ id: "a" }], nextCursor: { id: "a", createdAt: 1 } },
      { total: 2, items: [{ id: "b" }], nextCursor: null },
    ];
    const pages = await readDirectory(async (path, input) => {
      calls.push({ path, input });
      return batches.shift();
    });
    expect(pages).toEqual([{ id: "a" }, { id: "b" }]);
    expect(calls[1].input.cursor).toEqual({ id: "a", createdAt: 1 });
    await expect(
      readDirectory(async () => ({ total: 2, items: [{ id: "a" }], nextCursor: null })),
    ).rejects.toThrow("read 1 of 2");
  });

  it("counts pages once per rule and keeps failed archive checks separate", () => {
    expect(
      summarize([
        {
          status: "collected",
          findings: [
            { rule: "billing_evidence_mismatch", severity: "confirmed" },
            { rule: "billing_evidence_mismatch", severity: "confirmed" },
          ],
        },
        {
          status: "unavailable",
          findings: [{ rule: "archive_check_failed", severity: "unknown" }],
        },
      ]),
    ).toEqual({
      pages: 2,
      statuses: { collected: 1, unavailable: 1 },
      confirmedPages: 1,
      reviewPages: 0,
      rules: { billing_evidence_mismatch: 1, archive_check_failed: 1 },
    });
  });
});
