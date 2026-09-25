import { NUMERIC_USAGE_UNITS } from "@my-better-t-app/db/numeric-prices";
import {
  NUMERIC_FACT_ROLES,
  type FactUnit,
  type NumericFactRole,
} from "@my-better-t-app/db/pricing-facts";

type RoleSpec = {
  units: readonly FactUnit[];
  money: boolean;
  quantity: "none" | "required" | "if_metered";
  compareBilling: boolean;
  comparePeriod: "always" | "recurring" | "never";
};

/** One exhaustive contract for collection and comparison of each numeric role. */
export const FACT_ROLE_SPEC = {
  base_price: {
    units: ["flat"],
    money: true,
    quantity: "none",
    compareBilling: true,
    comparePeriod: "always",
  },
  seat_price: {
    units: ["seat"],
    money: true,
    quantity: "none",
    compareBilling: true,
    comparePeriod: "always",
  },
  usage_rate: {
    units: NUMERIC_USAGE_UNITS,
    money: true,
    quantity: "required",
    compareBilling: true,
    comparePeriod: "never",
  },
  outcome_rate: {
    units: NUMERIC_USAGE_UNITS,
    money: true,
    quantity: "required",
    compareBilling: true,
    comparePeriod: "never",
  },
  overage_rate: {
    units: NUMERIC_USAGE_UNITS,
    money: true,
    quantity: "required",
    compareBilling: true,
    comparePeriod: "never",
  },
  credit_pack_price: {
    units: ["credit"],
    money: true,
    quantity: "required",
    compareBilling: true,
    comparePeriod: "always",
  },
  addon_price: {
    units: ["flat", ...NUMERIC_USAGE_UNITS],
    money: true,
    quantity: "if_metered",
    compareBilling: true,
    comparePeriod: "recurring",
  },
  included_allowance: {
    units: NUMERIC_USAGE_UNITS,
    money: false,
    quantity: "none",
    compareBilling: true,
    comparePeriod: "always",
  },
  credit_conversion: {
    units: ["credit"],
    money: false,
    quantity: "required",
    compareBilling: false,
    comparePeriod: "never",
  },
  purchased_credit_expiry: {
    units: ["day", "month", "year"],
    money: false,
    quantity: "none",
    compareBilling: false,
    comparePeriod: "never",
  },
  included_credit_rollover_limit: {
    units: ["day", "month", "year"],
    money: false,
    quantity: "none",
    compareBilling: false,
    comparePeriod: "never",
  },
  minimum_seats: {
    units: ["seat"],
    money: false,
    quantity: "none",
    compareBilling: true,
    comparePeriod: "never",
  },
} as const satisfies Record<NumericFactRole, RoleSpec>;

export function isNumericFactRole(value: string): value is NumericFactRole {
  return Object.hasOwn(NUMERIC_FACT_ROLES, value);
}

export function needsQuantity(role: NumericFactRole, unit: FactUnit): boolean {
  const mode = FACT_ROLE_SPEC[role].quantity;
  return mode === "required" || (mode === "if_metered" && unit !== "flat");
}
