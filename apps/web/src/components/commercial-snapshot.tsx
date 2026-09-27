import type {
  PublishedPrice,
  PublishedSnapshot,
  SnapshotReview,
} from "@pricelog/api/pricing-snapshot";
import { formatToken } from "@/lib/format";
import { DataCell, DataRow, DataTable, RowHeader } from "./data-table";
import { MonetizationMetrics } from "./monetization-metrics";
import { Panel } from "./panel";

export function CommercialSnapshot({
  snapshot,
  review,
  meteredUnit,
}: {
  snapshot: PublishedSnapshot;
  review?: SnapshotReview[] | null;
  /** The metered unit Jev established, which picks the feature row an included price uses. */
  meteredUnit?: string;
}) {
  return (
    <>
      <Panel
        role="region"
        aria-label="Verified offers and features"
        title="Verified offers and features"
        description={snapshot.status === "unavailable" ? snapshot.reason : undefined}
      >
        {snapshot.status === "collected" ? (
          <>
            {snapshot.billing_view ? (
              <p>Billing view: {formatToken(snapshot.billing_view)}</p>
            ) : null}
            {snapshot.currency_visible ? (
              <p>Visible currency: {snapshot.currency_visible}</p>
            ) : null}
            <MonetizationMetrics snapshot={snapshot} meteredUnit={meteredUnit} />
            {snapshot.offers.length ? (
              <DataTable columns={["Plan", "Verified prices"]}>
                {snapshot.offers.map((offer) => (
                  <DataRow key={offer.name}>
                    <RowHeader>{offer.name}</RowHeader>
                    <DataCell>
                      {offer.prices.map((price, index) => (
                        <PriceLine key={`${price.price_raw}:${index}`} price={price} />
                      ))}
                    </DataCell>
                  </DataRow>
                ))}
              </DataTable>
            ) : (
              <p>No price passed verification for this capture.</p>
            )}
            {snapshot.shared_prices?.length ? (
              <DataTable columns={["Applies to all plans", "Verified prices"]}>
                <DataRow>
                  <RowHeader>Usage and add-ons</RowHeader>
                  <DataCell>
                    {snapshot.shared_prices.map((price, index) => (
                      <PriceLine key={`${price.price_raw}:${index}`} price={price} />
                    ))}
                  </DataCell>
                </DataRow>
              </DataTable>
            ) : null}
            {snapshot.features.length ? (
              <DataTable columns={["Feature", "Verified availability"]}>
                {snapshot.features.map((feature, index) => (
                  <DataRow key={`${feature.name}:${index}`}>
                    <RowHeader>{feature.name}</RowHeader>
                    <DataCell>
                      {feature.availability.map((cell, cellIndex) => (
                        <div key={`${cell.offer}:${cellIndex}`}>
                          {cell.offer}: {formatToken(cell.status)}
                          {cell.limit_raw ? ` · ${cell.limit_raw}` : ""}
                        </div>
                      ))}
                    </DataCell>
                  </DataRow>
                ))}
              </DataTable>
            ) : null}
          </>
        ) : null}
      </Panel>
      {review?.length ? (
        <Panel role="region" aria-label="Claims for review" title="Claims for review">
          <DataTable columns={["Field", "Result", "Value"]}>
            {review.map((item, index) => (
              <DataRow key={`${item.path}:${index}`}>
                <RowHeader>{item.path}</RowHeader>
                <DataCell>{formatToken(item.reason)}</DataCell>
                <DataCell>
                  {typeof item.value === "string" ? item.value : JSON.stringify(item.value)}
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        </Panel>
      ) : null}
    </>
  );
}

function PriceLine({ price }: { price: PublishedPrice }) {
  return (
    <div>
      {price.price_raw}
      {price.kind ? ` · ${formatToken(price.kind)}` : ""}
      {price.billing && price.billing !== "unknown"
        ? ` · billed ${formatToken(price.billing)}`
        : ""}
    </div>
  );
}
