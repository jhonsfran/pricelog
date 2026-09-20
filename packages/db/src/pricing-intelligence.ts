export const TAG_PROBABILITY_THRESHOLD = 0.8;

export const PRICING_SCORE_CATALOG = {
  cost_predictability: { label: "Cost predictability" },
  packaging_segmentation: { label: "Packaging segmentation" },
  offer_differentiation: { label: "Offer differentiation" },
  purchase_actionability: { label: "Purchase actionability" },
} as const;

export const PRICING_CHOICE_CATALOG = {
  primary_pricing_model: { label: "Pricing model" },
  buying_motion: { label: "Buying motion" },
  primary_customer_segment: { label: "Customer segment" },
  primary_market: { label: "Primary market" },
} as const;

export const PRICING_SIGNAL_CATALOG = {
  has_free_plan: { label: "Free plan", tag: "free-plan", priority: 2, showInProfile: true },
  has_free_trial: { label: "Free trial", tag: "free-trial", priority: 2, showInProfile: true },
  requires_sales_contact: {
    label: "Sales-assisted offer",
    tag: "sales-assisted",
    priority: 2,
    showInProfile: true,
  },
  shows_enterprise_plan: {
    label: "Enterprise offer",
    tag: "enterprise",
    priority: 2,
    showInProfile: true,
  },
  is_ai_native: { label: "AI-native product", tag: "ai-native", priority: 0, showInProfile: true },
  offers_copilot: { label: "AI copilot", tag: "ai-copilot", priority: 0, showInProfile: true },
  offers_autonomous_agent: {
    label: "Autonomous agent",
    tag: "autonomous-agent",
    priority: 0,
    showInProfile: true,
  },
  offers_agent_platform: {
    label: "Agent platform",
    tag: "agent-platform",
    priority: 0,
    showInProfile: true,
  },
  offers_agent_workforce: {
    label: "Agent workforce",
    tag: "agent-workforce",
    priority: 0,
    showInProfile: true,
  },
  market_developer_tools: {
    label: "Developer tools",
    tag: "developer-tools",
    priority: 1,
    showInProfile: false,
  },
  market_sales_marketing: {
    label: "Sales and marketing",
    tag: "sales-marketing",
    priority: 1,
    showInProfile: false,
  },
  market_customer_support: {
    label: "Customer support",
    tag: "customer-support",
    priority: 1,
    showInProfile: false,
  },
  market_productivity_collaboration: {
    label: "Productivity and collaboration",
    tag: "productivity-collaboration",
    priority: 1,
    showInProfile: false,
  },
  market_data_analytics: {
    label: "Data and analytics",
    tag: "data-analytics",
    priority: 1,
    showInProfile: false,
  },
  market_cybersecurity: {
    label: "Cybersecurity",
    tag: "cybersecurity",
    priority: 1,
    showInProfile: false,
  },
  market_finance: { label: "Finance", tag: "finance", priority: 1, showInProfile: false },
  market_commerce: { label: "Commerce", tag: "commerce", priority: 1, showInProfile: false },
  market_hr: { label: "Human resources", tag: "hr", priority: 1, showInProfile: false },
  market_operations: {
    label: "Operations",
    tag: "operations",
    priority: 1,
    showInProfile: false,
  },
  market_vertical_software: {
    label: "Vertical software",
    tag: "vertical-software",
    priority: 1,
    showInProfile: false,
  },
} as const;

export type PricingScoreKey = keyof typeof PRICING_SCORE_CATALOG;
export type PricingChoiceKey = keyof typeof PRICING_CHOICE_CATALOG;
export type PricingSignalKey = keyof typeof PRICING_SIGNAL_CATALOG;
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
