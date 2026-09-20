export const PRICING_QUALITY_V1 = {
  id: "pricing-quality-v1",
  version: 1,
  model: "typesafe/jev",
  questions: {
    pricing_transparency: {
      type: "score" as const,
      instructions: "How transparent is the page about what the buyer will pay?",
      criteria: [
        "No concrete price is visible.",
        "Only a starting price or contact-sales path is present, with no usable cost basis.",
        "Some prices are visible, but currency, billing period, unit, or conditions are missing.",
        "Most standard prices, units, currencies, and billing periods are explicit.",
        "All standard prices and cost units are explicit, including material pricing conditions.",
      ],
    },
    pricing_clarity: {
      type: "score" as const,
      instructions: "How easy is it to understand the pricing structure and terms?",
      criteria: [
        "The pricing structure cannot be understood.",
        "Major labels or terms are missing, conflicting, or undefined.",
        "The structure is present but requires substantial interpretation.",
        "The structure and most terms are clear, with minor ambiguity.",
        "The structure, terminology, and calculation basis are direct and unambiguous.",
      ],
    },
    pricing_completeness: {
      type: "score" as const,
      instructions: "How complete is the commercial information needed to evaluate a purchase?",
      criteria: [
        "Essential commercial information is absent.",
        "The page gives headline prices but little else.",
        "The page gives core prices plus some inclusions, limits, or billing details.",
        "The page covers most inclusions, limits, exclusions, billing rules, and extra costs.",
        "The page covers plans, inclusions, exclusions, limits, overages, billing, and eligibility.",
      ],
    },
    plan_comparability: {
      type: "score" as const,
      instructions: "How well can a buyer compare the available plans or purchase options?",
      criteria: [
        "The buyer cannot compare options.",
        "Options appear separately with no consistent basis for comparison.",
        "Some differences are stated, but important comparisons remain unclear.",
        "Major features, limits, and prices use a mostly consistent comparison structure.",
        "Plan differences, trade-offs, and intended customer fit are explicit.",
      ],
    },
    purchase_actionability: {
      type: "score" as const,
      instructions: "How clear is the next step to buy, try, or contact sales?",
      criteria: [
        "The page gives no purchase path.",
        "A generic contact path exists, but the next step is unclear.",
        "A call to action exists, but prerequisites or expected outcomes are unclear.",
        "Most plans have a clear next action and enough context to proceed.",
        "Every purchase path states the action and relevant trial, contract, or sales expectations.",
      ],
    },
  },
} as const;
