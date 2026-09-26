import { describe, expect, it } from "vitest";
import {
  cellStatus,
  classificationQuestions,
  decideSnapshot,
  groundExtraction,
  parseAmount,
  parseExtraction,
  readExtraction,
  type Extraction,
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
        Team members
        Unlimited
        ## Enterprise
        Enterprise usage
        Custom
        volume pricing

## state: billing=Yearly
(within: ## Starter)
$64 | /month
billed annually

## state: billing=Monthly; plan-tier=1
  ## Team
  Predictable usage
    $200
    /month
  billed monthly

## state: billing=Yearly; plan-tier=1
  ## Team
  Predictable usage
    $160
    /month
  billed annually`;

const EXTRACTION: Extraction = {
  offers: [
    {
      name: "Free",
      prices: [{ text: "$0 /month", state: "default" }],
      limits: [{ name: "Monthly credits", value: "1x" }],
    },
    {
      name: "Starter",
      prices: [
        { text: "$80 /month", state: "default" },
        { text: "$64 | /month", state: "billing=Yearly" },
      ],
      limits: [{ name: "Team members", value: "Unlimited" }],
    },
    {
      name: "Team",
      prices: [
        { text: "$200 /month", state: "billing=Monthly; plan-tier=1" },
        { text: "$160 /month", state: "billing=Yearly; plan-tier=1" },
      ],
      limits: [],
    },
    { name: "Enterprise", prices: [{ text: "Custom", state: "default" }], limits: [] },
  ],
  features: [],
  rates: [],
};

const VERCEL_STATE = `## state: default
  ## Pro
  $20/user/month
  ## Usage pricing
  Edge Requests | $2 | per 1M requests
  Fast Data Transfer (Pro) | $0.15 | per GB
  Spend management cap | $1,000`;

const VERCEL_EXTRACTION: Extraction = {
  offers: [{ name: "Pro", prices: [{ text: "$20/user/month", state: "default" }], limits: [] }],
  features: [],
  rates: [
    { name: "Edge Requests", price: "$2", per: "per 1M requests", offer: null, state: "default" },
    { name: "Fast Data Transfer", price: "$0.15", per: "per GB", offer: "Pro", state: "default" },
    { name: "Spend management cap", price: "$1,000", per: null, offer: null, state: "default" },
    {
      name: "Image Optimization",
      price: "$5",
      per: "per 1K images",
      offer: null,
      state: "default",
    },
    { name: "Pro", price: "$20/user/month", per: null, offer: "Pro", state: "default" },
  ],
};

const choice = (key: string, value: string, confidence = 0.95): JevAnswer => ({
  key,
  type: "choice",
  choice: value,
  confidence,
  probabilities: { [value]: confidence },
});
const price = (
  index: number,
  role: string,
  billing: string,
  period: string,
  unit: string,
): JevAnswer[] => [
  choice(`price_${index}_role`, role),
  choice(`price_${index}_billing`, billing),
  choice(`price_${index}_period`, period),
  choice(`price_${index}_unit`, unit),
];
const ANSWERS = [
  ...price(0, "free_plan", "monthly", "month", "flat"),
  ...price(1, "base_price", "monthly", "month", "flat"),
  ...price(2, "base_price", "annual", "month", "flat"),
  ...price(3, "base_price", "monthly", "month", "flat"),
  ...price(4, "base_price", "annual", "month", "flat"),
  ...price(5, "custom_price", "unknown", "none", "custom"),
];
const RUBRIC: JevAnswer[] = [
  { key: "has_free_plan", type: "noul", noul: 0.97 },
  { key: "has_free_trial", type: "noul", noul: 0.06 },
  { key: "offers_copilot", type: "noul", noul: 0.48 },
];

describe("quote snapshot", () => {
  it("publishes every grounded polylane price with its plan and billing", () => {
    const grounded = groundExtraction(POLYLANE_STATE, EXTRACTION);
    expect(classificationQuestions(grounded.prices)).toHaveLength(24);
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "monthly",
      grounded,
      answers: ANSWERS,
      rubricAnswers: RUBRIC,
    });
    const base = { unit: "flat", period: "month" } as const;
    expect(decision.snapshot).toEqual({
      version: "pricing-snapshot-v3",
      status: "collected",
      billing_view: "monthly",
      currency_visible: "USD",
      flags: { has_free_plan: true, has_free_trial: false },
      offers: [
        {
          name: "Free",
          is_free: true,
          prices: [
            {
              ...base,
              role: "free_plan",
              price_raw: "$0 /month",
              price_numeric: 0,
              billing: "monthly",
              state: "default",
            },
          ],
        },
        {
          name: "Starter",
          prices: [
            {
              ...base,
              role: "base_price",
              price_raw: "$80 /month",
              price_numeric: 80,
              billing: "monthly",
              state: "default",
            },
            {
              ...base,
              role: "base_price",
              price_raw: "$64 | /month",
              price_numeric: 64,
              billing: "annual",
              state: "billing=Yearly",
            },
          ],
        },
        {
          name: "Team",
          prices: [
            {
              ...base,
              role: "base_price",
              price_raw: "$200 /month",
              price_numeric: 200,
              billing: "monthly",
              state: "billing=Monthly; plan-tier=1",
            },
            {
              ...base,
              role: "base_price",
              price_raw: "$160 /month",
              price_numeric: 160,
              billing: "annual",
              state: "billing=Yearly; plan-tier=1",
            },
          ],
        },
        {
          name: "Enterprise",
          is_contact_sales: true,
          prices: [
            {
              role: "custom_price",
              price_raw: "Custom",
              price_numeric: null,
              period: "unknown",
              unit: "custom",
              billing: "unknown",
              state: "default",
            },
          ],
        },
      ],
      features: [
        {
          name: "Monthly credits",
          availability: [{ offer: "Free", status: "limited", limit_raw: "1x" }],
        },
        {
          name: "Team members",
          availability: [{ offer: "Starter", status: "included", limit_raw: "Unlimited" }],
        },
      ],
    });
    expect(decision.review).toEqual([
      { path: "flags.offers_copilot", reason: "uncertain", value: 0.48 },
    ]);
    expect(decision.coverage).toEqual({ literals: 5, claimed: 5 });
  });

  it("sends a quote that is not on the page to review", () => {
    const extraction: Extraction = {
      offers: [
        {
          name: "Starter",
          prices: [
            { text: "$80 /month", state: "default" },
            { text: "$99 /month", state: "default" },
          ],
          limits: [],
        },
        { name: "Scale", prices: [{ text: "$800 /month", state: "default" }], limits: [] },
      ],
      features: [],
      rates: [],
    };
    const grounded = groundExtraction(POLYLANE_STATE, extraction);
    expect(grounded.prices.map((item) => item.text)).toEqual(["$80 /month"]);
    expect(grounded.review).toEqual([
      { path: "offers.0.prices.1", reason: "ungrounded", value: "$99 /month" },
      { path: "offers.1.name", reason: "ungrounded", value: "Scale" },
      { path: "offers.1.prices.0", reason: "ungrounded", value: "$800 /month" },
    ]);
  });

  it("rejects amounts Jev marks as not a price and keeps uncertain ones for review", () => {
    const extraction: Extraction = {
      offers: [
        {
          name: "Starter",
          prices: [
            { text: "$80 /month", state: "default" },
            { text: "$64 | /month", state: "billing=Yearly" },
          ],
          limits: [],
        },
      ],
      features: [],
      rates: [],
    };
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "unknown",
      grounded: groundExtraction(POLYLANE_STATE, extraction),
      answers: [choice("price_0_role", "not_a_price"), choice("price_1_role", "base_price", 0.5)],
      rubricAnswers: [],
    });
    expect(decision.snapshot.offers).toEqual([{ name: "Starter", prices: [] }]);
    expect(decision.review.slice(0, 2)).toEqual([
      { path: "prices.0", reason: "rejected", value: "$80 /month" },
      { path: "prices.1", reason: "uncertain", value: "$64 | /month" },
    ]);
    expect(
      decision.review.filter((item) => item.reason === "unclaimed").map((item) => item.value),
    ).toEqual(["$0", "$200", "$160"]);
  });

  it("keeps a price whose billing is uncertain and marks the billing unknown", () => {
    const extraction: Extraction = {
      offers: [{ name: "Starter", prices: [{ text: "$80 /month", state: "default" }], limits: [] }],
      features: [],
      rates: [],
    };
    const decision = decideSnapshot({
      stateText: POLYLANE_STATE,
      billingView: "unknown",
      grounded: groundExtraction(POLYLANE_STATE, extraction),
      answers: [
        choice("price_0_role", "base_price"),
        choice("price_0_billing", "annual", 0.4),
        choice("price_0_period", "month"),
        choice("price_0_unit", "flat"),
      ],
      rubricAnswers: [],
    });
    expect(decision.snapshot.offers[0]?.prices).toEqual([
      {
        role: "base_price",
        price_raw: "$80 /month",
        price_numeric: 80,
        period: "month",
        unit: "flat",
        billing: "unknown",
        state: "default",
      },
    ]);
  });

  it("flags a page that shows another currency than the capture requested", () => {
    const extraction: Extraction = {
      offers: [{ name: "Starter", prices: [{ text: "$80 /month", state: "default" }], limits: [] }],
      features: [],
      rates: [],
    };
    const decide = (requestedCurrency: string) =>
      decideSnapshot({
        stateText: POLYLANE_STATE,
        billingView: "unknown",
        grounded: groundExtraction(POLYLANE_STATE, extraction),
        answers: [choice("price_0_role", "base_price")],
        rubricAnswers: [],
        requestedCurrency,
      }).review.filter((item) => item.reason === "mismatch");
    expect(decide("EUR")).toEqual([
      { path: "currency_visible", reason: "mismatch", value: "USD shown; EUR requested" },
    ]);
    expect(decide("USD")).toEqual([]);
  });

  it("maps comparison cells to availability without a model", () => {
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
    expect(parseExtraction({ response: { offers: [] } })).toEqual({ offers: [] });
    expect(
      parseExtraction({
        choices: [{ message: { content: '```json\n{"features": []}\n```' } }],
      }),
    ).toEqual({ features: [] });
    expect(() => parseExtraction({ response: "{not json" })).toThrow("invalid JSON");
    expect(
      readExtraction(
        {
          offers: [
            {
              name: "Pro",
              prices: [{ text: "$20" }, { text: "" }],
              limits: [{ name: "Seats", value: null }],
            },
            { name: "" },
          ],
        },
        { features: "none" },
      ),
    ).toEqual({
      offers: [
        {
          name: "Pro",
          prices: [{ text: "$20", state: "default" }],
          limits: [{ name: "Seats", value: null }],
        },
      ],
      features: [],
      rates: [],
    });
  });

  it("publishes usage rates from rate tables once, with their unit", () => {
    const decision = decideSnapshot({
      stateText: VERCEL_STATE,
      billingView: "unknown",
      grounded: groundExtraction(VERCEL_STATE, VERCEL_EXTRACTION),
      answers: [
        ...price(0, "base_price", "monthly", "month", "per_seat"),
        choice("rate_0_role", "usage_rate"),
        choice("rate_1_role", "overage_rate"),
        choice("rate_2_role", "not_a_price"),
      ],
      rubricAnswers: [],
    });
    expect(decision.snapshot.rates).toEqual([
      {
        name: "Edge Requests",
        price_raw: "$2",
        price_numeric: 2,
        currency: "USD",
        per: "per 1M requests",
        offer: null,
        role: "usage_rate",
        state: "default",
      },
      {
        name: "Fast Data Transfer",
        price_raw: "$0.15",
        price_numeric: 0.15,
        currency: "USD",
        per: "per GB",
        offer: "Pro",
        role: "overage_rate",
        state: "default",
      },
    ]);
    expect(decision.snapshot.offers[0]?.prices.map((item) => item.price_raw)).toEqual([
      "$20/user/month",
    ]);
    expect(decision.review).toEqual([
      { path: "rates.3", reason: "ungrounded", value: "Image Optimization $5 per 1K images" },
      { path: "rates.2", reason: "rejected", value: "$1,000" },
    ]);
    expect(decision.coverage).toEqual({ literals: 4, claimed: 4 });
  });

  it("sends rates that are not on the page to review and skips repeated plan prices", () => {
    const grounded = groundExtraction(VERCEL_STATE, VERCEL_EXTRACTION);
    expect(grounded.rates.map((rate) => rate.name)).toEqual([
      "Edge Requests",
      "Fast Data Transfer",
      "Spend management cap",
    ]);
    expect(grounded.review).toEqual([
      { path: "rates.3", reason: "ungrounded", value: "Image Optimization $5 per 1K images" },
    ]);
    expect(classificationQuestions(grounded.prices, grounded.rates).map((q) => q.key)).toEqual([
      "price_0_role",
      "price_0_billing",
      "price_0_period",
      "price_0_unit",
      "rate_0_role",
      "rate_1_role",
      "rate_2_role",
    ]);
  });
});
