import { monetizationMetrics, type PublishedSnapshot } from "@pricelog/api/pricing-snapshot";
import { DataCell, DataRow, DataTable, RowHeader } from "./data-table";

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: amount < 1 ? 4 : 2,
  }).format(amount);

/** Numbers computed from the verified prices and features; absent when the facts do not settle them. */
export function MonetizationMetrics({
  snapshot,
  meteredUnit,
}: {
  snapshot: PublishedSnapshot;
  meteredUnit?: string;
}) {
  const metrics = monetizationMetrics(snapshot, meteredUnit);
  const rows: { key: string; label: string; value: string }[] = [];
  if (metrics.entry_price)
    rows.push({
      key: "entry",
      label: "Entry price",
      value: `${money(metrics.entry_price.amount, metrics.entry_price.currency)} per month (${metrics.entry_price.plan})`,
    });
  if (metrics.price_ladder)
    rows.push({
      key: "ladder",
      label: "Price ladder",
      value: `${metrics.price_ladder.tiers
        .map((tier) => `${tier.plan} ${money(tier.amount, metrics.price_ladder!.currency)}`)
        .join(" · ")} (top tier ${metrics.price_ladder.ratio}× the entry)`,
    });
  if (metrics.annual_discount)
    rows.push({
      key: "annual",
      label: "Annual discount",
      value: `${metrics.annual_discount.median}% median (${metrics.annual_discount.plans
        .map((plan) => `${plan.plan} ${plan.percent}%`)
        .join(" · ")})`,
    });
  for (const item of metrics.effective_unit_price ?? [])
    rows.push({
      key: `unit:${item.plan}`,
      label: `Included ${item.unit} price · ${item.plan}`,
      value: `${money(item.per_unit, item.currency)} per ${item.unit}, ${money(item.per_thousand, item.currency)} per 1,000 (${item.included.toLocaleString("en")} included)`,
    });
  for (const item of metrics.overage_markup ?? [])
    rows.push({
      key: `overage:${item.quote}`,
      label: `Overage vs included · ${item.unit}`,
      value: `${item.quote} is ${item.markup}× the ${item.plan} included price`,
    });
  if (!rows.length) return null;
  return (
    <DataTable columns={["Monetization", "Computed from verified prices"]}>
      {rows.map((row) => (
        <DataRow key={row.key}>
          <RowHeader>{row.label}</RowHeader>
          <DataCell>{row.value}</DataCell>
        </DataRow>
      ))}
    </DataTable>
  );
}
