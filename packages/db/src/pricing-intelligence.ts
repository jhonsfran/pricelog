export const PRICING_INTELLIGENCE_RUBRIC_ID = "pricing-intelligence-v3";
export const PRICING_INTELLIGENCE_RUBRIC_VERSION = 3;
export const CHOICE_CONFIDENCE_THRESHOLD = 0.75;
export const TAG_PROBABILITY_THRESHOLD = 0.8;

/**
 * This catalog is the single source of truth for every question Pricelog asks.
 * The server rubric builds its Jev prompt from it and the web client renders
 * methodology from it, so the evaluation and the published explanation of that
 * evaluation cannot drift apart.
 */

export const PRICING_SCORE_CATALOG = {
  cost_predictability: {
    label: "Cost predictability",
    question: "How well can a buyer predict their actual recurring cost?",
    criteria: [
      "The buyer cannot estimate any cost.",
      "Only a starting price or contact-sales path is available.",
      "Standard prices exist, but important cost variables or conditions are missing.",
      "Most buyers can estimate a normal monthly or annual cost.",
      "The buyer can estimate the normal cost, material overages, and important conditions.",
    ],
  },
  packaging_segmentation: {
    label: "Packaging segmentation",
    question: "How well do the plans map different customer needs to a clear upgrade path?",
    criteria: [
      "Plans have no clear differences or upgrade path.",
      "Differences are mainly labels or arbitrary feature removal.",
      "Some meaningful features or limits separate the plans.",
      "Each plan maps to a clear customer need or operating scale.",
      "The plans create a coherent path from entry through expansion.",
    ],
  },
  offer_differentiation: {
    label: "Offer differentiation",
    question: "How clearly does the page explain why a buyer should select each offer?",
    criteria: [
      "The offers cannot be distinguished.",
      "The page lists plans but gives little basis for selection.",
      "Some plan differences are clear, but intended fit remains ambiguous.",
      "Major differences and intended customer fit are clear.",
      "Each offer has a distinct value proposition, buyer fit, and trade-off.",
    ],
  },
  purchase_actionability: {
    label: "Purchase actionability",
    question: "How clear is the next step to buy, try, or contact sales?",
    criteria: [
      "The page gives no purchase path.",
      "A generic contact path exists, but the next step is unclear.",
      "A call to action exists, but its prerequisites or expected outcome are unclear.",
      "Most offers have a clear next action and enough context to proceed.",
      "Every purchase path states the action and relevant trial, contract, or sales expectations.",
    ],
  },
  value_metric_alignment: {
    label: "Value metric alignment",
    question: "How closely does the billing unit track the value the customer receives?",
    criteria: [
      "The bill is unrelated to any value the customer receives.",
      "The unit correlates weakly and can penalize normal successful use.",
      "The unit correlates for some customers but breaks at common edges.",
      "The unit tracks received value for most customers most of the time.",
      "Cost rises only when the customer demonstrably receives more value.",
    ],
  },
  expansion_readiness: {
    label: "Expansion readiness",
    question: "How well can an existing account grow in spend without a new sales cycle?",
    criteria: [
      "No published mechanism increases spend on an existing account.",
      "Growth requires renegotiation or a new contract.",
      "A growth path exists, but its cost is not published.",
      "At least one published mechanism raises spend as the customer grows.",
      "Published seat, usage, or tier paths let spend follow adoption continuously.",
    ],
  },
} as const;

/** Ordered presentation groups for the commercial profile. */
export const PRICING_CHOICE_GROUPS = [
  { key: "model", label: "Commercial model" },
  { key: "access", label: "Access and disclosure" },
  { key: "ai_cost", label: "AI cost" },
  { key: "audience", label: "Audience" },
] as const;

export const PRICING_CHOICE_CATALOG = {
  primary_pricing_model: {
    label: "Pricing model",
    group: "model",
    question: "What is the primary mechanism that determines the price?",
    options: {
      flat_subscription: "A fixed recurring subscription is the primary price basis.",
      per_seat: "The number of users or seats is the primary price basis.",
      usage_based: "Measured product usage is the primary price basis.",
      transaction_based: "Transactions or payment volume are the primary price basis.",
      outcome_based: "A completed result or business outcome is the primary price basis.",
      feature_tiered: "Access to feature bundles is the primary price basis.",
      hybrid: "Two or more price mechanisms materially determine the bill.",
      custom: "The price is individually negotiated without a public primary mechanism.",
      unknown: "The page does not provide enough evidence to select a pricing model.",
    },
  },
  value_metric: {
    label: "Value metric",
    group: "model",
    question: "Which unit does the customer's bill scale with?",
    options: {
      seat: "Named users or seats.",
      active_user: "Only users who actually used the product in the period.",
      api_call: "Requests, API calls, or messages.",
      token: "Model tokens consumed.",
      action_or_run: "Completed workflow runs, tasks, or agent actions.",
      record_or_object: "Stored records, contacts, documents, or objects.",
      transaction_value: "A percentage or fee on transaction volume.",
      outcome: "A verified business result.",
      flat: "Nothing. The price does not scale with any unit.",
      unknown: "The page does not establish a billing unit.",
    },
  },
  expansion_path: {
    label: "Expansion path",
    group: "model",
    question: "How does an existing account grow in revenue without a new sale?",
    options: {
      seat_expansion: "Adding users increases the bill.",
      usage_overage: "Exceeding included usage increases the bill.",
      tier_upgrade: "Moving to a higher plan is the primary growth path.",
      add_on: "Separately priced modules are the primary growth path.",
      none: "No published mechanism increases revenue from an existing account.",
      unknown: "The page does not establish an expansion path.",
    },
  },
  buying_motion: {
    label: "Buying motion",
    group: "model",
    question: "What is the primary path by which a customer can start buying?",
    options: {
      self_serve: "A customer can start or purchase without speaking to sales.",
      sales_led: "A customer must contact sales to start or purchase.",
      hybrid: "Self-service and sales-led paths are both material parts of the offer.",
      unknown: "The page does not provide enough evidence to select a buying motion.",
    },
  },
  price_disclosure: {
    label: "Price disclosure",
    group: "access",
    question: "How much of the price is stated publicly on the page?",
    options: {
      full: "Every offer states a price.",
      partial: "Entry offers state a price and higher offers do not.",
      starting_at: "Only a starting or 'from' price is stated.",
      gated: "No price is available without a form or a sales conversation.",
      unknown: "The page does not establish how much pricing is disclosed.",
    },
  },
  plan_count: {
    label: "Plan count",
    group: "access",
    question: "How many distinct plans does the page present?",
    options: {
      one: "A single plan or a single price is presented.",
      two_or_three: "Two or three distinct plans are presented.",
      four_or_five: "Four or five distinct plans are presented.",
      six_or_more: "Six or more distinct plans are presented.",
      unknown: "The page does not present a countable set of plans.",
    },
  },
  annual_commitment_discount: {
    label: "Annual discount",
    group: "access",
    question: "What discount does an annual commitment receive compared with monthly billing?",
    options: {
      no_annual_option: "The page offers no annual billing option.",
      no_discount: "Annual billing is offered at no stated discount.",
      under_15_percent: "The stated annual discount is below fifteen percent.",
      fifteen_to_twenty_five_percent:
        "The stated annual discount is fifteen to twenty-five percent.",
      over_twenty_five_percent: "The stated annual discount is above twenty-five percent.",
      unknown: "The page does not establish an annual discount.",
    },
  },
  ai_cost_passthrough: {
    label: "AI cost model",
    group: "ai_cost",
    question: "How does the customer pay for the product's AI compute?",
    options: {
      included: "AI cost is absorbed into the plan price with no separate meter.",
      credits: "A credit balance is consumed by AI work.",
      tokens: "Model tokens are billed directly.",
      per_action: "Each agent action, run, or task is billed.",
      per_outcome: "Only a verified result is billed.",
      bring_your_own_key: "The customer supplies and pays for their own model access.",
      not_applicable: "The product does not bill for AI compute.",
      unknown: "The page does not establish how AI cost is charged.",
    },
  },
  primary_customer_segment: {
    label: "Customer segment",
    group: "audience",
    question: "Which customer segment is the pricing primarily designed for?",
    options: {
      individual: "The offer is primarily for one person or an independent professional.",
      small_business: "The offer is primarily for small businesses or small teams.",
      mid_market: "The offer is primarily for established organizations with larger teams.",
      enterprise: "The offer is primarily for large organizations with procurement requirements.",
      multiple_segments: "The page clearly provides material offers for several segments.",
      unknown: "The page does not provide enough evidence to select a customer segment.",
    },
  },
  primary_market: {
    label: "Primary market",
    group: "audience",
    question: "Which business function or software market is the primary product for?",
    options: {
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
  },
} as const;

/**
 * `priority` orders the tags shown on a directory row: 0 is AI capability and
 * AI cost intelligence, 1 is market, 2 is general commercial structure.
 */
export const PRICING_SIGNAL_CATALOG = {
  has_free_plan: {
    label: "Free plan",
    tag: "free-plan",
    priority: 2,
    showInProfile: true,
    question: "Does the page offer a recurring free plan rather than only a time-limited trial?",
    whenTrue: "A recurring plan with no required payment is offered.",
    whenFalse: "No recurring free plan is offered or the page does not establish one.",
  },
  has_free_trial: {
    label: "Free trial",
    tag: "free-trial",
    priority: 2,
    showInProfile: true,
    question: "Does the page offer a time-limited free trial of a paid product?",
    whenTrue: "A time-limited free trial is offered.",
    whenFalse: "No time-limited free trial is offered or the page does not establish one.",
  },
  requires_card_for_free: {
    label: "Card required up front",
    tag: "card-required",
    priority: 2,
    showInProfile: true,
    question: "Does starting the free plan or free trial require payment details up front?",
    whenTrue: "The page states that a card or payment method is required to start for free.",
    whenFalse: "The page does not establish that payment details are required to start for free.",
  },
  requires_sales_contact: {
    label: "Sales-assisted offer",
    tag: "sales-assisted",
    priority: 2,
    showInProfile: true,
    question: "Must at least one material offer be purchased through a sales conversation?",
    whenTrue: "A material offer requires contact with sales, a demo, or a quote.",
    whenFalse:
      "No material offer requires a sales conversation or the page does not establish one.",
  },
  shows_enterprise_plan: {
    label: "Enterprise offer",
    tag: "enterprise",
    priority: 2,
    showInProfile: true,
    question: "Does the page present an enterprise plan or equivalent large-organization offer?",
    whenTrue: "An enterprise or equivalent large-organization offer is present.",
    whenFalse: "No enterprise offer is present or the page does not establish one.",
  },
  publishes_numeric_limits: {
    label: "Numeric limits published",
    tag: "numeric-limits",
    priority: 2,
    showInProfile: true,
    question: "Does the page state plan limits as specific numbers rather than vague wording?",
    whenTrue: "At least one plan limit is stated as a specific number or quantity.",
    whenFalse: "Limits are described only in vague terms or the page does not establish them.",
  },
  has_usage_calculator: {
    label: "Usage calculator",
    tag: "usage-calculator",
    priority: 2,
    showInProfile: true,
    question: "Does the page provide a calculator or estimator for the customer's expected cost?",
    whenTrue: "An interactive calculator, slider, or estimator for cost is present.",
    whenFalse: "The page does not establish a cost calculator or estimator.",
  },
  is_ai_native: {
    label: "AI-native product",
    tag: "ai-native",
    priority: 0,
    showInProfile: true,
    question: "Is AI necessary to the product's main value proposition?",
    whenTrue: "The core product would lose its main value without AI.",
    whenFalse: "AI is absent, optional, or only an accessory feature.",
  },
  offers_copilot: {
    label: "AI copilot",
    tag: "ai-copilot",
    priority: 0,
    showInProfile: true,
    question:
      "Does the product offer an AI copilot that assists while a person controls important actions?",
    whenTrue: "The product offers interactive AI assistance under direct user control.",
    whenFalse: "The page does not establish an AI copilot.",
  },
  offers_autonomous_agent: {
    label: "Autonomous agent",
    tag: "autonomous-agent",
    priority: 0,
    showInProfile: true,
    question:
      "Can the product independently complete user-directed multi-step tasks or take external actions?",
    whenTrue: "The product can plan or execute multi-step work with meaningful autonomy.",
    whenFalse:
      "The page only establishes generation, advice, or direct user-controlled assistance.",
  },
  offers_agent_platform: {
    label: "Agent platform",
    tag: "agent-platform",
    priority: 0,
    showInProfile: true,
    question:
      "Can customers build, deploy, manage, or monitor their own AI agents with this product?",
    whenTrue: "The product provides infrastructure or tools for customer-created agents.",
    whenFalse: "The page does not establish an agent-building or agent-runtime platform.",
  },
  offers_agent_workforce: {
    label: "Agent workforce",
    tag: "agent-workforce",
    priority: 0,
    showInProfile: true,
    question: "Does the product sell agents as equivalents for defined business roles or workers?",
    whenTrue: "Agents are packaged as workers or replacements for named business roles.",
    whenFalse: "The page does not package agents as a workforce or named business role.",
  },
  has_spend_cap: {
    label: "Customer spend cap",
    tag: "spend-cap",
    priority: 0,
    showInProfile: true,
    question: "Can the customer set a hard limit on what they will be charged?",
    whenTrue:
      "The page states a spending cap, budget, or hard usage ceiling the customer controls.",
    whenFalse: "The page does not establish a customer-controlled spending limit.",
  },
  has_usage_visibility: {
    label: "Usage visible before invoice",
    tag: "usage-visibility",
    priority: 0,
    showInProfile: true,
    question: "Can the customer see consumption before the invoice arrives?",
    whenTrue: "The page states in-product usage tracking, a dashboard, or consumption alerts.",
    whenFalse: "The page does not establish visibility into consumption before billing.",
  },
  credits_expire: {
    label: "Credits expire",
    tag: "credits-expire",
    priority: 0,
    showInProfile: true,
    question: "Do purchased or included credits expire when they are not used?",
    whenTrue: "The page states that credits expire or do not roll over.",
    whenFalse: "The page does not establish credit expiry.",
  },
  market_developer_tools: {
    label: "Developer tools",
    tag: "developer-tools",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve software development, infrastructure, APIs, or engineering operations?",
    whenTrue: "Developer tools are a material market for the product.",
    whenFalse: "Developer tools are not established as a material market.",
  },
  market_sales_marketing: {
    label: "Sales and marketing",
    tag: "sales-marketing",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve sales, marketing, advertising, or revenue operations?",
    whenTrue: "Sales or marketing is a material market for the product.",
    whenFalse: "Sales or marketing is not established as a material market.",
  },
  market_customer_support: {
    label: "Customer support",
    tag: "customer-support",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve customer service, success, support, or contact centers?",
    whenTrue: "Customer support is a material market for the product.",
    whenFalse: "Customer support is not established as a material market.",
  },
  market_productivity_collaboration: {
    label: "Productivity and collaboration",
    tag: "productivity-collaboration",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve general productivity, communication, or collaboration?",
    whenTrue: "Productivity or collaboration is a material market for the product.",
    whenFalse: "Productivity or collaboration is not established as a material market.",
  },
  market_data_analytics: {
    label: "Data and analytics",
    tag: "data-analytics",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve data management, analytics, business intelligence, or machine learning data?",
    whenTrue: "Data or analytics is a material market for the product.",
    whenFalse: "Data or analytics is not established as a material market.",
  },
  market_cybersecurity: {
    label: "Cybersecurity",
    tag: "cybersecurity",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve application, identity, network, data, or operational security?",
    whenTrue: "Cybersecurity is a material market for the product.",
    whenFalse: "Cybersecurity is not established as a material market.",
  },
  market_finance: {
    label: "Finance",
    tag: "finance",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve payments, accounting, billing, banking, investing, or financial operations?",
    whenTrue: "Finance is a material market for the product.",
    whenFalse: "Finance is not established as a material market.",
  },
  market_commerce: {
    label: "Commerce",
    tag: "commerce",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve retail, ecommerce, marketplaces, or commerce operations?",
    whenTrue: "Commerce is a material market for the product.",
    whenFalse: "Commerce is not established as a material market.",
  },
  market_hr: {
    label: "Human resources",
    tag: "hr",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve recruiting, payroll, people management, or human resources?",
    whenTrue: "Human resources is a material market for the product.",
    whenFalse: "Human resources is not established as a material market.",
  },
  market_operations: {
    label: "Operations",
    tag: "operations",
    priority: 1,
    showInProfile: false,
    question:
      "Does the product materially serve business operations, automation, logistics, or service delivery?",
    whenTrue: "Business operations is a material market for the product.",
    whenFalse: "Business operations is not established as a material market.",
  },
  market_vertical_software: {
    label: "Vertical software",
    tag: "vertical-software",
    priority: 1,
    showInProfile: false,
    question: "Is the product designed primarily for one named industry or profession?",
    whenTrue: "The product is vertical software for a named industry or profession.",
    whenFalse: "The product is horizontal or the page does not establish a vertical market.",
  },
} as const;

export type PricingScoreKey = keyof typeof PRICING_SCORE_CATALOG;
export type PricingChoiceKey = keyof typeof PRICING_CHOICE_CATALOG;
export type PricingSignalKey = keyof typeof PRICING_SIGNAL_CATALOG;
export type PricingChoiceGroupKey = (typeof PRICING_CHOICE_GROUPS)[number]["key"];
export type PricingIntelligenceQuestionKey = PricingScoreKey | PricingChoiceKey | PricingSignalKey;

export function isPricingScoreKey(value: string): value is PricingScoreKey {
  return Object.hasOwn(PRICING_SCORE_CATALOG, value);
}

export function isPricingChoiceKey(value: string): value is PricingChoiceKey {
  return Object.hasOwn(PRICING_CHOICE_CATALOG, value);
}

export function isPricingSignalKey(value: string): value is PricingSignalKey {
  return Object.hasOwn(PRICING_SIGNAL_CATALOG, value);
}

export function pricingTagPriority(tag: string): number {
  const signal = Object.values(PRICING_SIGNAL_CATALOG).find((item) => item.tag === tag);
  return signal?.priority ?? Number.MAX_SAFE_INTEGER;
}
