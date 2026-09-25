import { describe, expect, it } from "vitest";
import type { DraftSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { DRAFT_CHOICE_KEYS, DRAFT_FLAG_KEYS } from "@my-better-t-app/db/pricing-snapshot";
import { PRICING_INTELLIGENCE_RUBRIC } from "./rubric";
import {
  DRAFT_JSON_SCHEMA,
  draftSnapshotSchema,
  normalizeRecoveryDraft,
  parseDraftResult,
} from "./draft-snapshot";
import { buildDraftQuestions, numericMatchesLabel, publishDraft } from "./draft-validation";
import type { JevAnswer, PersistedQuestion } from "./types";

const draft: DraftSnapshot = {
  buying_motion: "self_serve",
  price_disclosure: "full",
  primary_customer_segment: "small_business",
  primary_market: "developer_tools",
  product_category: "coding_assistants",
  billing_view: "monthly",
  currency_visible: "USD",
  flags: Object.fromEntries(
    DRAFT_FLAG_KEYS.map((key) => [key, key === "has_free_trial"]),
  ) as DraftSnapshot["flags"],
  offers: [
    {
      name: "Pro",
      is_highlighted: true,
      is_free: false,
      is_contact_sales: false,
      audience_blurb: "For teams",
      prices: [
        {
          role: "seat_price",
          price_raw: "$20 per seat/month",
          price_numeric: 20,
          period: "month",
          unit: "per_seat",
        },
      ],
    },
  ],
  features: [
    {
      name: "Projects",
      availability: [{ offer: "Pro", status: "limited", limit_raw: "10 projects" }],
    },
  ],
};

const rubricQuestions: PersistedQuestion[] = Object.entries(
  PRICING_INTELLIGENCE_RUBRIC.questions,
).map(
  ([key, question], position) =>
    ({
      key,
      type: question.type,
      instructions: question.instructions,
      criteria: question.criteria,
      position,
      minimum: null,
      maximum: null,
    }) as PersistedQuestion,
);

function agreedAnswers(): JevAnswer[] {
  const values: Record<string, string> = {
    ...Object.fromEntries(DRAFT_CHOICE_KEYS.map((key) => [key, draft[key]])),
    draft_billing_view: draft.billing_view,
    offer_0_price_0_role: "seat_price",
    offer_0_price_0_period: "month",
    offer_0_price_0_unit: "per_seat",
    feature_0_cell_0_status: "limited",
  };
  return buildDraftQuestions(rubricQuestions, draft).map((question) =>
    question.type === "choice"
      ? {
          key: question.key,
          type: "choice",
          choice: values[question.key]!,
          confidence: 0.94,
          probabilities: { [values[question.key]!]: 0.94 },
        }
      : {
          key: question.key,
          type: "noul",
          noul:
            (question.key in draft.flags &&
              !draft.flags[question.key as keyof typeof draft.flags]) ||
            question.key === "offer_0_free" ||
            question.key === "offer_0_contact"
              ? 0.05
              : 0.96,
        },
  );
}

describe("pricing draft", () => {
  it("uses the same controlled fields in the JSON schema and parser", () => {
    expect(draftSnapshotSchema.parse(draft)).toEqual(draft);
    expect(parseDraftResult({ result: draft }).draft).toEqual(draft);
    expect(parseDraftResult({ result: "not json" }).draft).toBeNull();
    expect(Object.keys(DRAFT_JSON_SCHEMA.properties)).toEqual(Object.keys(draft));
    expect(
      draftSnapshotSchema.safeParse({
        ...draft,
        offers: [
          { ...draft.offers[0], prices: [{ ...draft.offers[0]!.prices[0], role: "invented" }] },
        ],
      }).success,
    ).toBe(false);
  });

  it("maps observed model aliases while retaining the original proposal", () => {
    const proposal = {
      ...draft,
      currency_visible: "unknown",
      offers: [
        {
          ...draft.offers[0],
          prices: [{ ...draft.offers[0]!.prices[0], role: "user", unit: "user" }],
        },
      ],
      features: [
        {
          ...draft.features[0],
          availability: [{ offer: "Pro", status: "available", limit_raw: null }],
        },
      ],
    };
    const { value, changes } = normalizeRecoveryDraft(proposal);
    expect(changes).toBe(4);
    expect(parseDraftResult(value).draft).toMatchObject({
      currency_visible: null,
      offers: [{ prices: [{ role: "seat_price", unit: "per_seat" }] }],
      features: [{ availability: [{ status: "included" }] }],
    });
    expect(proposal.offers[0]?.prices[0]?.role).toBe("user");
  });

  it("maps a base monthly price and a custom price into valid draft roles", () => {
    const proposal = {
      ...draft,
      offers: [
        {
          ...draft.offers[0],
          prices: [
            {
              role: "main",
              price_raw: "$600/mo",
              price_numeric: 600,
              period: "month",
              unit: "month",
            },
            {
              role: "annual term",
              price_raw: "$600/mo",
              price_numeric: 600,
              period: "month",
              unit: "mo",
            },
            {
              role: "base",
              price_raw: "$600/mo",
              price_numeric: 600,
              period: "month",
              unit: "user",
            },
            {
              role: "base",
              price_raw: "Custom",
              price_numeric: 0,
              period: "custom",
              unit: "custom",
            },
          ],
        },
      ],
    };
    const { value } = normalizeRecoveryDraft(proposal);
    expect(parseDraftResult(value).draft?.offers[0]?.prices).toMatchObject([
      { role: "base_price", unit: "flat", period: "month" },
      { role: "base_price", unit: "flat", period: "month" },
      { role: "base_price", unit: "flat", period: "month" },
      { role: "custom_price", unit: "custom", period: "unknown", price_numeric: null },
    ]);
  });

  it("keeps numeric feature limits as claims for Jev to check", () => {
    const proposal = {
      ...draft,
      features: [
        {
          ...draft.features[0],
          availability: [{ offer: "Pro", status: "included", limit_raw: 13500 }],
        },
      ],
    };
    const { value, changes } = normalizeRecoveryDraft(proposal);
    expect(changes).toBe(1);
    expect(parseDraftResult(value).draft?.features[0]?.availability[0]?.limit_raw).toBe("13500");
    expect(proposal.features[0]?.availability[0]?.limit_raw).toBe(13500);
  });

  it("fills an omitted feature limit with null", () => {
    const proposal = {
      ...draft,
      features: [
        {
          ...draft.features[0],
          availability: [{ offer: "Pro", status: "included" }],
        },
      ],
    };
    const { value, changes } = normalizeRecoveryDraft(proposal);
    expect(changes).toBe(1);
    expect(parseDraftResult(value).draft?.features[0]?.availability[0]?.limit_raw).toBeNull();
  });

  it("asks one claim per proposal without inserting the draft into Jev state", () => {
    const questions = buildDraftQuestions(rubricQuestions, draft);
    expect(questions.find((question) => question.key === "offer_0_name")?.instructions).toContain(
      "Pro",
    );
    expect(questions.find((question) => question.key === "offer_0_price_0_raw")?.type).toBe("noul");
    expect(
      questions.find((question) => question.key === "feature_0_cell_0_status")?.criteria,
    ).toHaveProperty("not_included");
    expect(questions.some((question) => question.key === "credit_conversion")).toBe(false);
  });

  it("publishes only matching claims and sends mismatches to review", () => {
    const agreed = publishDraft(draft, agreedAnswers());
    expect(agreed.snapshot.offers[0]?.prices[0]?.price_raw).toBe("$20 per seat/month");
    expect(agreed.snapshot.features[0]?.availability[0]?.status).toBe("limited");
    expect(agreed.signals.find((item) => item.key === "has_free_trial")?.probability).toBe(0.96);
    expect(agreed.review).toEqual([]);

    const answers = agreedAnswers().map((answer) =>
      answer.key === "offer_0_price_0_raw" && answer.type === "noul"
        ? { ...answer, noul: 0.05 }
        : answer.key === "buying_motion" && answer.type === "choice"
          ? { ...answer, choice: "sales_led" }
          : answer,
    );
    const rejected = publishDraft(draft, answers);
    expect(rejected.snapshot.offers[0]?.prices).toEqual([]);
    expect(rejected.choices.some((item) => item.key === "buying_motion")).toBe(false);
    expect(rejected.review).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "offers.0.prices.0.price_raw", reason: "rejected" }),
        expect.objectContaining({ path: "buying_motion", reason: "rejected" }),
      ]),
    );
  });

  it("publishes a verified custom price with no billing period", () => {
    const customDraft: DraftSnapshot = {
      ...draft,
      offers: [
        {
          ...draft.offers[0]!,
          prices: [
            {
              role: "custom_price",
              price_raw: "Custom",
              price_numeric: null,
              period: "unknown",
              unit: "custom",
            },
          ],
        },
      ],
    };
    const answers = agreedAnswers().map((answer) => {
      if (answer.type !== "choice") return answer;
      const choices: Record<string, string> = {
        offer_0_price_0_role: "custom_price",
        offer_0_price_0_period: "unknown",
        offer_0_price_0_unit: "custom",
      };
      const choice = choices[answer.key];
      return choice
        ? { ...answer, choice, confidence: 0.99, probabilities: { [choice]: 0.99 } }
        : answer;
    });
    expect(publishDraft(customDraft, answers).snapshot.offers[0]?.prices).toEqual(
      customDraft.offers[0]?.prices,
    );
  });

  it("does not accept a numeric draft that is absent from its visible label", () => {
    expect(numericMatchesLabel("$1,000 per year", 1000)).toBe(true);
    expect(numericMatchesLabel("$20 per month", 200)).toBe(false);
    expect(numericMatchesLabel("$20 per 100 requests", 100)).toBe(false);
    expect(numericMatchesLabel("Free", 0)).toBe(true);
  });
});
