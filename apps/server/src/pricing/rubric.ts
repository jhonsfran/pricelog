import type { PricingIntelligenceQuestionKey } from "@my-better-t-app/db/pricing-intelligence";

const score = (instructions: string, criteria: readonly string[]) => ({
  type: "score" as const,
  instructions,
  criteria,
});

const choice = (instructions: string, criteria: Readonly<Record<string, string>>) => ({
  type: "choice" as const,
  instructions,
  criteria,
});

const noul = (instructions: string, trueCriterion: string, falseCriterion: string) => ({
  type: "noul" as const,
  instructions,
  criteria: { true: trueCriterion, false: falseCriterion },
});

type RubricQuestion =
  | ReturnType<typeof score>
  | ReturnType<typeof choice>
  | ReturnType<typeof noul>;

export const PRICING_INTELLIGENCE_V2 = {
  id: "pricing-intelligence-v2",
  version: 2,
  model: "typesafe/jev",
  questions: {
    cost_predictability: score("How well can a buyer predict their actual recurring cost?", [
      "The buyer cannot estimate any cost.",
      "Only a starting price or contact-sales path is available.",
      "Standard prices exist, but important cost variables or conditions are missing.",
      "Most buyers can estimate a normal monthly or annual cost.",
      "The buyer can estimate the normal cost, material overages, and important conditions.",
    ]),
    packaging_segmentation: score(
      "How well do the plans map different customer needs to a clear upgrade path?",
      [
        "Plans have no clear differences or upgrade path.",
        "Differences are mainly labels or arbitrary feature removal.",
        "Some meaningful features or limits separate the plans.",
        "Each plan maps to a clear customer need or operating scale.",
        "The plans create a coherent path from entry through expansion.",
      ],
    ),
    offer_differentiation: score(
      "How clearly does the page explain why a buyer should select each offer?",
      [
        "The offers cannot be distinguished.",
        "The page lists plans but gives little basis for selection.",
        "Some plan differences are clear, but intended fit remains ambiguous.",
        "Major differences and intended customer fit are clear.",
        "Each offer has a distinct value proposition, buyer fit, and trade-off.",
      ],
    ),
    purchase_actionability: score("How clear is the next step to buy, try, or contact sales?", [
      "The page gives no purchase path.",
      "A generic contact path exists, but the next step is unclear.",
      "A call to action exists, but its prerequisites or expected outcome are unclear.",
      "Most offers have a clear next action and enough context to proceed.",
      "Every purchase path states the action and relevant trial, contract, or sales expectations.",
    ]),
    primary_pricing_model: choice("What is the primary mechanism that determines the price?", {
      flat_subscription: "A fixed recurring subscription is the primary price basis.",
      per_seat: "The number of users or seats is the primary price basis.",
      usage_based: "Measured product usage is the primary price basis.",
      transaction_based: "Transactions or payment volume are the primary price basis.",
      outcome_based: "A completed result or business outcome is the primary price basis.",
      feature_tiered: "Access to feature bundles is the primary price basis.",
      hybrid: "Two or more price mechanisms materially determine the bill.",
      custom: "The price is individually negotiated without a public primary mechanism.",
      unknown: "The page does not provide enough evidence to select a pricing model.",
    }),
    buying_motion: choice("What is the primary path by which a customer can start buying?", {
      self_serve: "A customer can start or purchase without speaking to sales.",
      sales_led: "A customer must contact sales to start or purchase.",
      hybrid: "Self-service and sales-led paths are both material parts of the offer.",
      unknown: "The page does not provide enough evidence to select a buying motion.",
    }),
    primary_customer_segment: choice(
      "Which customer segment is the pricing primarily designed for?",
      {
        individual: "The offer is primarily for one person or an independent professional.",
        small_business: "The offer is primarily for small businesses or small teams.",
        mid_market: "The offer is primarily for established organizations with larger teams.",
        enterprise: "The offer is primarily for large organizations with procurement requirements.",
        multiple_segments: "The page clearly provides material offers for several segments.",
        unknown: "The page does not provide enough evidence to select a customer segment.",
      },
    ),
    primary_market: choice(
      "Which business function or software market is the primary product for?",
      {
        developer_tools: "Software development, infrastructure, APIs, or engineering operations.",
        sales_marketing: "Sales, marketing, advertising, or revenue operations.",
        customer_support: "Customer service, success, support, or contact centers.",
        productivity_collaboration: "General productivity, communication, or team collaboration.",
        data_analytics:
          "Data management, business intelligence, analytics, or machine learning data.",
        cybersecurity: "Application, identity, network, data, or operational security.",
        finance: "Payments, accounting, billing, banking, investing, or financial operations.",
        commerce: "Retail, ecommerce, marketplaces, or commerce operations.",
        hr: "Recruiting, payroll, people management, or human resources.",
        operations: "General business operations, automation, logistics, or service delivery.",
        vertical_software: "Software designed primarily for one named industry or profession.",
        other: "A supported market that does not fit the controlled categories.",
        unknown: "The page does not provide enough evidence to select a primary market.",
      },
    ),
    has_free_plan: noul(
      "Does the page offer a recurring free plan rather than only a time-limited trial?",
      "A recurring plan with no required payment is offered.",
      "No recurring free plan is offered or the page does not establish one.",
    ),
    has_free_trial: noul(
      "Does the page offer a time-limited free trial of a paid product?",
      "A time-limited free trial is offered.",
      "No time-limited free trial is offered or the page does not establish one.",
    ),
    requires_sales_contact: noul(
      "Must at least one material offer be purchased through a sales conversation?",
      "A material offer requires contact with sales, a demo, or a quote.",
      "No material offer requires a sales conversation or the page does not establish one.",
    ),
    shows_enterprise_plan: noul(
      "Does the page present an enterprise plan or equivalent large-organization offer?",
      "An enterprise or equivalent large-organization offer is present.",
      "No enterprise offer is present or the page does not establish one.",
    ),
    is_ai_native: noul(
      "Is AI necessary to the product's main value proposition?",
      "The core product would lose its main value without AI.",
      "AI is absent, optional, or only an accessory feature.",
    ),
    offers_copilot: noul(
      "Does the product offer an AI copilot that assists while a person controls important actions?",
      "The product offers interactive AI assistance under direct user control.",
      "The page does not establish an AI copilot.",
    ),
    offers_autonomous_agent: noul(
      "Can the product independently complete user-directed multi-step tasks or take external actions?",
      "The product can plan or execute multi-step work with meaningful autonomy.",
      "The page only establishes generation, advice, or direct user-controlled assistance.",
    ),
    offers_agent_platform: noul(
      "Can customers build, deploy, manage, or monitor their own AI agents with this product?",
      "The product provides infrastructure or tools for customer-created agents.",
      "The page does not establish an agent-building or agent-runtime platform.",
    ),
    offers_agent_workforce: noul(
      "Does the product sell agents as equivalents for defined business roles or workers?",
      "Agents are packaged as workers or replacements for named business roles.",
      "The page does not package agents as a workforce or named business role.",
    ),
    market_developer_tools: noul(
      "Does the product materially serve software development, infrastructure, APIs, or engineering operations?",
      "Developer tools are a material market for the product.",
      "Developer tools are not established as a material market.",
    ),
    market_sales_marketing: noul(
      "Does the product materially serve sales, marketing, advertising, or revenue operations?",
      "Sales or marketing is a material market for the product.",
      "Sales or marketing is not established as a material market.",
    ),
    market_customer_support: noul(
      "Does the product materially serve customer service, success, support, or contact centers?",
      "Customer support is a material market for the product.",
      "Customer support is not established as a material market.",
    ),
    market_productivity_collaboration: noul(
      "Does the product materially serve general productivity, communication, or collaboration?",
      "Productivity or collaboration is a material market for the product.",
      "Productivity or collaboration is not established as a material market.",
    ),
    market_data_analytics: noul(
      "Does the product materially serve data management, analytics, business intelligence, or machine learning data?",
      "Data or analytics is a material market for the product.",
      "Data or analytics is not established as a material market.",
    ),
    market_cybersecurity: noul(
      "Does the product materially serve application, identity, network, data, or operational security?",
      "Cybersecurity is a material market for the product.",
      "Cybersecurity is not established as a material market.",
    ),
    market_finance: noul(
      "Does the product materially serve payments, accounting, billing, banking, investing, or financial operations?",
      "Finance is a material market for the product.",
      "Finance is not established as a material market.",
    ),
    market_commerce: noul(
      "Does the product materially serve retail, ecommerce, marketplaces, or commerce operations?",
      "Commerce is a material market for the product.",
      "Commerce is not established as a material market.",
    ),
    market_hr: noul(
      "Does the product materially serve recruiting, payroll, people management, or human resources?",
      "Human resources is a material market for the product.",
      "Human resources is not established as a material market.",
    ),
    market_operations: noul(
      "Does the product materially serve business operations, automation, logistics, or service delivery?",
      "Business operations is a material market for the product.",
      "Business operations is not established as a material market.",
    ),
    market_vertical_software: noul(
      "Is the product designed primarily for one named industry or profession?",
      "The product is vertical software for a named industry or profession.",
      "The product is horizontal or the page does not establish a vertical market.",
    ),
  } satisfies Record<PricingIntelligenceQuestionKey, RubricQuestion>,
} as const;
