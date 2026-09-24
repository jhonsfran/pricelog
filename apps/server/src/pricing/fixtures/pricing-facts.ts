import type { NumericFact, OfferPolicy } from "@my-better-t-app/db/pricing-facts";

export type ExpectedFact = Omit<NumericFact, "evidence" | "confidence">;
export type FactFixture = {
  id: string;
  source: string;
  offers: string[];
  expected: ExpectedFact[];
  policies?: Pick<OfferPolicy, "offer" | "key" | "choice">[];
};
const base: ExpectedFact = {
  key: "base_price",
  offer: "Pro",
  amount: "20",
  unit: "flat",
  currency: "USD",
  billing: "monthly",
  period: "month",
  quantity: null,
  quantityUnit: null,
};

/** Synthetic labels test the method. They are not evidence of production accuracy. */
export const factFixtures: FactFixture[] = [
  {
    id: "two-plans",
    source:
      "## Pro\nUSD $20 per month, billed monthly. Includes 100 credits per month.\n\n## Team\nUSD $50 per month, billed monthly. Includes 500 credits per month.",
    offers: ["Pro", "Team"],
    expected: [
      base,
      { ...base, key: "included_allowance", amount: "100", unit: "credit", currency: null },
      { ...base, offer: "Team", amount: "50" },
      {
        ...base,
        offer: "Team",
        key: "included_allowance",
        amount: "500",
        unit: "credit",
        currency: null,
      },
    ],
  },
  {
    id: "annual-seat-and-minimum",
    source:
      "## Pro\nUSD $12.50 per seat per month, billed annually. Minimum 5 seats for this annual plan.",
    offers: ["Pro"],
    expected: [
      { ...base, key: "seat_price", amount: "12.50", unit: "seat", billing: "annual" },
      {
        ...base,
        key: "minimum_seats",
        amount: "5",
        unit: "seat",
        currency: null,
        billing: "annual",
        period: "unknown",
      },
    ],
  },
  {
    id: "credit-expiry",
    source:
      "## Credits\nBuy a one-time pack of 1000 credits for USD $10. Purchased credits expire after 12 months.",
    offers: ["Credits"],
    expected: [
      {
        ...base,
        key: "credit_pack_price",
        offer: "Credits",
        amount: "10",
        unit: "credit",
        billing: "one_time",
        period: "one_time",
        quantity: "1000",
        quantityUnit: "credit",
      },
      {
        ...base,
        key: "purchased_credit_expiry",
        offer: "Credits",
        amount: "12",
        unit: "month",
        currency: null,
        billing: "one_time",
        period: "unknown",
      },
    ],
  },
  {
    id: "direct-usage",
    source: "## API\nPay as you go: USD $0.02 per 1000 requests. No subscription required.",
    offers: ["API"],
    expected: [
      {
        ...base,
        key: "usage_rate",
        offer: "API",
        amount: "0.02",
        unit: "request",
        billing: "usage",
        period: "unknown",
        quantity: "1000",
        quantityUnit: "request",
      },
    ],
  },
  {
    id: "bare-dollar",
    source: "## Pro\n$20 per month, billed monthly.",
    offers: ["Pro"],
    expected: [{ ...base, currency: "DOLLAR_UNSPECIFIED" }],
  },
  {
    id: "free-is-explicit",
    source: "## Free\nUSD $0 per month, billed monthly.",
    offers: ["Free"],
    expected: [{ ...base, offer: "Free", amount: "0" }],
  },
  {
    id: "crossed-out-and-current",
    source:
      "## Pro\nPrevious price: ~~USD $10~~. Current regular price: USD $20 per month, billed monthly.",
    offers: ["Pro"],
    expected: [base],
  },
  {
    id: "different-failed-run-policies",
    source: "## Pro\nFailed runs consume credits.\n\n## Team\nFailed runs do not consume credits.",
    offers: ["Pro", "Team"],
    expected: [],
    policies: [
      { offer: "Pro", key: "failed_run_policy", choice: "charged" },
      { offer: "Team", key: "failed_run_policy", choice: "not_charged" },
    ],
  },
];
