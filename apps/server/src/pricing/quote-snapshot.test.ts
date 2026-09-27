import { describe, expect, it } from "vitest";
import { deriveProfile } from "@pricelog/db/pricing-snapshot";
import {
  cellStatus,
  decideSnapshot,
  factQuestions,
  groundExtraction,
  parseAmount,
  parseExtraction,
  readExtraction,
  type Extraction,
  missedPrices,
} from "./quote-snapshot";
import type { JevAnswer } from "./types";

const POLYLANE_STATE = `## state: default
  # Pricing. Transparent.
  Monthly | Yearly
        ## Free
        Try Polylane
          $0
          /month
        free forever
        Monthly credits
        1x
        ## Starter
        Investigate, operate, automate
          $80
          /month
        billed monthly
        Monthly credits
        10x
        ## Enterprise
        Enterprise usage
        Custom
        volume pricing
        Extra credits | $10 | per 1,000 credits

## state: billing=Yearly
(within: ## Starter)
$64 | /month
billed annually`;

const price = (plan: string | null, text: string, state = "default") => ({ plan, text, state });

const EXTRACTION: Extraction = {
  prices: [
    price("Free", "$0 /month"),
    price("Starter", "$80 /month"),
    price("Starter", "$64 | /month", "billing=Yearly"),
    price("Enterprise", "Custom"),
    price(null, "$10 | per 1,000 credits"),
  ],
  features: [
    {
      name: "Monthly credits",
      cells: [
        { plan: "Free", value: "1x" },
        { plan: "Starter", value: "10x" },
      ],
    },
  ],
};

const yes = (key: string, noul = 0.95): JevAnswer => ({ key, type: "noul", noul });
const chose = (key: string, choice: string, confidence = 0.95): JevAnswer => ({
  key,
  type: "choice",
  choice,
  confidence,
  probabilities: { [choice]: confidence },
});
const ALL_CONFIRMED = [
  chose("price_0", "free"),
  chose("price_1", "flat_monthly"),
  chose("price_2", "flat_annual"),
  chose("price_3", "custom"),
  chose("price_4", "add_on"),
  yes("feature_0"),
];

describe("quote snapshot", () => {
  it("asks Jev one question per price and one per feature row", () => {
    const grounded = groundExtraction(POLYLANE_STATE, EXTRACTION);
    const questions = factQuestions(grounded);
    expect(questions.map((question) => [question.key, question.type])).toEqual([
      ["price_0", "choice"],
      ["price_1", "choice"],
      ["price_2", "choice"],
      ["price_3", "choice"],
      ["price_4", "choice"],
      ["feature_0", "noul"],
    ]);
    expect(questions[2]?.instructions).toContain(
      'What is the amount "$64 | /month" shown for plan "Starter" in page state "billing=Yearly"?',
    );
    expect(questions[4]?.instructions).toContain(
      'What is the amount "$10 | per 1,000 credits" shown for all plans in page state "default"?',
    );
    expect(Object.keys(questions[0]?.criteria ?? {})).toEqual([
      "flat_monthly",
      "flat_annual",
      "per_seat_monthly",
      "per_seat_annual",
      "usage",
      "add_on",
      "free",
      "custom",
      "not_this_plan",
    ]);
    expect(questions[5]?.instructions).toContain(
      'Does the page state, for feature "Monthly credits": Free = "1x"; Starter = "10x"?',
    );
  });

  it("publishes the prices and feature rows Jev confirmed", () => {
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "monthly",
      grounded: groundExtraction(POLYLANE_STATE, EXTRACTION),
      answers: ALL_CONFIRMED,
    });
    expect(decision.snapshot).toEqual({
      version: "pricing-snapshot-v4",
      status: "collected",
      billing_view: "monthly",
      currency_visible: "USD",
      offers: [
        {
          name: "Free",
          prices: [
            {
              kind: "free",
              price_raw: "$0 /month",
              price_numeric: 0,
              period: "none",
              billing: "unknown",
              state: "default",
            },
          ],
        },
        {
          name: "Starter",
          prices: [
            {
              kind: "flat",
              price_raw: "$80 /month",
              price_numeric: 80,
              period: "month",
              billing: "monthly",
              state: "default",
            },
            {
              kind: "flat",
              price_raw: "$64 | /month",
              price_numeric: 64,
              period: "month",
              billing: "annual",
              state: "billing=Yearly",
            },
          ],
        },
        {
          name: "Enterprise",
          prices: [
            {
              kind: "custom",
              price_raw: "Custom",
              price_numeric: null,
              period: "none",
              billing: "unknown",
              state: "default",
            },
          ],
        },
      ],
      shared_prices: [
        {
          kind: "add_on",
          price_raw: "$10 | per 1,000 credits",
          price_numeric: 10,
          period: "none",
          billing: "unknown",
          state: "default",
        },
      ],
      features: [
        {
          name: "Monthly credits",
          availability: [
            { offer: "Free", status: "limited", limit_raw: "1x" },
            { offer: "Starter", status: "limited", limit_raw: "10x" },
          ],
        },
      ],
    });
    expect(decision.review).toEqual([]);
    expect(decision.coverage).toEqual({ literals: 4, claimed: 4 });
    expect(deriveProfile(decision.snapshot)).toEqual({
      price_disclosure: "partial",
      has_free_plan: true,
      requires_sales_contact: true,
      publishes_numeric_limits: true,
      charges_fixed_subscription: true,
      charges_per_seat: false,
      charges_direct_usage: false,
      charges_credit_wallet: true,
      charges_ai_addon: true,
    });
  });

  it("treats an empty price list from a page with amounts as a failed answer", () => {
    expect(missedPrices("prices", { prices: [] }, "## Pro\n$20 / mo")).toBe(true);
    expect(missedPrices("prices", { prices: [] }, "## Enterprise\nContact sales")).toBe(false);
    expect(missedPrices("prices", { prices: [{ text: "$20 / mo" }] }, "$20 / mo")).toBe(false);
    expect(missedPrices("features", { features: [] }, "$20 / mo")).toBe(false);
    const looping = Array.from({ length: 30 }, () => ({ plan: null, text: "$0.09" }));
    expect(missedPrices("prices", { prices: looping }, "$0.09")).toBe(true);
  });

  it("asks Jev once for a price line the model repeated", () => {
    const grounded = groundExtraction(POLYLANE_STATE, {
      prices: [price("Starter", "$80 /month"), price("Starter", "$80 /month", "billing=Yearly")],
      features: [],
    });
    expect(grounded.prices.map((item) => [item.plan, item.text])).toEqual([
      ["Starter", "$80 /month"],
    ]);
    expect(factQuestions(grounded).map((question) => question.key)).toEqual(["price_0"]);
  });

  it("sends claims Jev did not confirm to review with the reason", () => {
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "unknown",
      grounded: groundExtraction(POLYLANE_STATE, EXTRACTION),
      answers: [
        chose("price_0", "free"),
        chose("price_1", "flat_monthly", 0.4),
        chose("price_2", "not_this_plan"),
        yes("feature_0", 0.3),
      ],
    });
    expect(decision.snapshot.offers.map((offer) => offer.name)).toEqual(["Free"]);
    expect(decision.snapshot.features).toEqual([]);
    expect(decision.review).toEqual([
      { path: "prices.1", reason: "uncertain", value: "Starter: $80 /month" },
      { path: "prices.2", reason: "rejected", value: "Starter: $64 | /month" },
      { path: "prices.3", reason: "missing", value: "Enterprise: Custom" },
      { path: "prices.4", reason: "missing", value: "$10 | per 1,000 credits" },
      {
        path: "features.0",
        reason: "uncertain",
        value: "Monthly credits: Free = 1x; Starter = 10x",
      },
    ]);
  });

  it("sends quotes that are not on the page to review", () => {
    const grounded = groundExtraction(POLYLANE_STATE, {
      prices: [price("Starter", "$99 /month"), price("Scale", "$80 /month")],
      features: [
        { name: "Seats", cells: [{ plan: "Free", value: "2" }] },
        { name: "Monthly credits", cells: [{ plan: "Free", value: "5x" }] },
      ],
    });
    expect(grounded.prices).toEqual([]);
    expect(grounded.features).toEqual([]);
    expect(grounded.review).toEqual([
      { path: "extraction.prices.0", reason: "ungrounded", value: "Starter: $99 /month" },
      { path: "extraction.prices.1", reason: "ungrounded", value: "Scale: $80 /month" },
      { path: "extraction.features.0", reason: "ungrounded", value: "Seats" },
      { path: "extraction.features.1.cells.0", reason: "ungrounded", value: "Free: 5x" },
    ]);
  });

  it("flags a page that shows another currency than the capture requested", () => {
    const decide = (requestedCurrency: string) =>
      decideSnapshot({
        stateText: POLYLANE_STATE,
        billingView: "unknown",
        grounded: groundExtraction(POLYLANE_STATE, EXTRACTION),
        answers: ALL_CONFIRMED,
        requestedCurrency,
      }).review.filter((item) => item.reason === "mismatch");
    expect(decide("EUR")).toEqual([
      { path: "currency_visible", reason: "mismatch", value: "USD shown; EUR requested" },
    ]);
    expect(decide("USD")).toEqual([]);
  });

  it("publishes a price without an amount only as free or custom", () => {
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "unknown",
      grounded: groundExtraction(POLYLANE_STATE, {
        prices: [price("Enterprise", "Custom")],
        features: [],
      }),
      answers: [chose("price_0", "flat_monthly")],
    });
    expect(decision.snapshot.offers).toEqual([]);
    expect(decision.review.filter((item) => item.path === "prices.0")).toEqual([
      { path: "prices.0", reason: "invalid", value: "Enterprise: Custom" },
    ]);
  });

  it("does not publish a plan's feature line as its free or custom price", () => {
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "unknown",
      grounded: groundExtraction(POLYLANE_STATE, {
        prices: [price("Free", "Monthly credits"), price("Enterprise", "volume pricing")],
        features: [],
      }),
      answers: [chose("price_0", "free"), chose("price_1", "custom")],
    });
    expect(decision.snapshot.offers).toEqual([]);
    expect(
      decision.review
        .filter((item) => item.path.startsWith("prices."))
        .map((item) => [item.path, item.reason]),
    ).toEqual([
      ["prices.0", "invalid"],
      ["prices.1", "invalid"],
    ]);
  });

  it("maps feature values to availability without a model", () => {
    expect(
      [
        "[✓]",
        "[icon:green]",
        "[icon:gray]",
        "—",
        "·",
        "[icon]",
        "Add-on",
        "Contact sales",
        "Unlimited",
        "10 seats",
      ].map(cellStatus),
    ).toEqual([
      { status: "included" },
      { status: "included" },
      { status: "not_included" },
      { status: "not_included" },
      { status: "unknown" },
      { status: "unknown" },
      { status: "add_on", limit_raw: "Add-on" },
      { status: "contact", limit_raw: "Contact sales" },
      { status: "included", limit_raw: "Unlimited" },
      { status: "limited", limit_raw: "10 seats" },
    ]);
  });

  it("reads amounts and currencies from quoted labels", () => {
    expect(
      [
        "$8.33 /mo",
        "€12",
        "A$49",
        "$2.5K partner payouts",
        "$ 590 | per workspace / year",
        "1,200 USD",
        "Custom",
        "$.012 per minute",
      ].map(parseAmount),
    ).toEqual([
      { value: 8.33, currency: "USD" },
      { value: 12, currency: "EUR" },
      { value: 49, currency: "AUD" },
      { value: 2500, currency: "USD" },
      { value: 590, currency: "USD" },
      { value: 1200, currency: "USD" },
      null,
      { value: 0.012, currency: "USD" },
    ]);
  });

  it("reads extraction output from both Workers AI response shapes", () => {
    expect(parseExtraction({ response: { prices: [] } })).toEqual({ prices: [] });
    expect(
      parseExtraction({
        choices: [{ message: { content: '```json\n{"features": []}\n```' } }],
      }),
    ).toEqual({ features: [] });
    expect(() => parseExtraction({ response: "{not json" })).toThrow("invalid JSON");
    expect(
      readExtraction(
        {
          prices: [
            { plan: "Pro", text: "$20", kind: "flat" },
            { plan: "Pro", text: "" },
          ],
        },
        { features: [{ name: "Seats", cells: [{ plan: "Pro", value: "5" }, { plan: "" }] }] },
      ),
    ).toEqual({
      prices: [{ plan: "Pro", text: "$20", state: "default" }],
      features: [{ name: "Seats", cells: [{ plan: "Pro", value: "5" }] }],
    });
  });
});
