import type { PublishedSnapshot, SnapshotReview } from "@my-better-t-app/api/pricing-snapshot";
import { formatToken } from "@/lib/format";
import { DataCell, DataRow, DataTable, RowHeader } from "./data-table";
import { Panel } from "./panel";

export function CommercialSnapshot({
  snapshot,
  review,
}: {
  snapshot: PublishedSnapshot;
  review?: SnapshotReview[] | null;
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
            {snapshot.offers.length ? (
              <DataTable columns={["Offer", "Published prices", "Details"]}>
                {snapshot.offers.map((offer) => (
                  <DataRow key={offer.name}>
                    <RowHeader>{offer.name}</RowHeader>
                    <DataCell>
                      {offer.prices.length
                        ? offer.prices.map((price, index) => (
                            <div key={`${price.price_raw}:${index}`}>
                              {price.price_raw} · {formatToken(price.role)}
                            </div>
                          ))
                        : "No verified price"}
                    </DataCell>
                    <DataCell>
                      {offer.audience_blurb ? <div>{offer.audience_blurb}</div> : null}
                      {offer.is_highlighted ? <div>Highlighted offer</div> : null}
                      {offer.is_free ? <div>Free plan</div> : null}
                      {offer.is_contact_sales ? <div>Contact sales</div> : null}
                    </DataCell>
                  </DataRow>
                ))}
              </DataTable>
            ) : (
              <p>No offer passed verification for this capture.</p>
            )}
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
          <DataTable columns={["Field", "Result", "Draft value"]}>
            {review.map((item, index) => (
              <DataRow key={`${item.path}:${index}`}>
                <RowHeader>{item.path}</RowHeader>
                <DataCell>{formatToken(item.reason)}</DataCell>
                <DataCell>
                  {typeof item.draftValue === "string"
                    ? item.draftValue
                    : JSON.stringify(item.draftValue)}
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        </Panel>
      ) : null}
    </>
  );
}
