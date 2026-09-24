import type { FactUnit, NumericFact, PricingFacts } from "@my-better-t-app/api/pricing-facts";
import { serverUrl } from "@/lib/url";
import { getPricingChoiceLabel } from "@my-better-t-app/api/pricing-intelligence";
import { CellNote, DataCell, DataRow, DataTable, RowHeader } from "./data-table";
import { formatToken } from "@/lib/format";
import { answerTone } from "./intelligence-profile";
import { Disclosure, Evidence, StatRow } from "./page";
import { Panel } from "./panel";

function units(amount: string, unit: FactUnit) {
  if (unit === "flat") return amount;
  if (unit === "gb") return `${amount} GB`;
  return `${amount} ${unit}${Number(amount) === 1 ? "" : "s"}`;
}

function factValue(fact: NumericFact) {
  const amount = fact.currency
    ? `${fact.currency === "DOLLAR_UNSPECIFIED" ? "$" : fact.currency} ${fact.amount}`
    : units(fact.amount, fact.unit);
  if (fact.quantity !== null && fact.quantityUnit !== null) {
    return `${amount} / ${units(fact.quantity, fact.quantityUnit)}`;
  }
  return fact.key === "seat_price" ? `${amount} / seat` : amount;
}

const billingLabels = {
  monthly: "Monthly commitment",
  annual: "Annual commitment",
  one_time: "One-time purchase",
  usage: "Usage charge",
  unknown: "Billing not established",
} as const;

const periodLabels = {
  month: "Per month",
  year: "Per year",
  one_time: "One-time amount",
  unknown: "Period not established",
} as const;

export function PricingFactsPanel({
  facts,
  sourceUrl,
}: {
  facts?: PricingFacts | null;
  sourceUrl?: string | null;
}) {
  const offers = [
    ...new Set([
      ...(facts?.facts.map((fact) => fact.offer) ?? []),
      ...(facts?.policies.map((policy) => policy.offer) ?? []),
    ]),
  ];

  return (
    <Panel
      role="region"
      aria-label="Pricing facts by offer"
      title="Pricing facts by offer"
      description={
        !facts
          ? "Offer facts have not been collected for this capture. A new scan will collect them."
          : facts.status === "unavailable"
            ? "Offer fact collection is unavailable for this capture. This does not establish that prices or policies are absent."
            : undefined
      }
    >
      {facts && facts.status !== "unavailable" ? (
        <>
          <StatRow
            items={[
              { label: "Accepted facts", value: facts.coverage.accepted },
              { label: "Candidates", value: facts.coverage.candidates },
              { label: "Unresolved numbers", value: facts.coverage.uncertain },
              { label: "Unresolved policies", value: facts.coverage.policyUncertain },
              { label: "Excluded", value: facts.coverage.ignored },
            ]}
          />
          {!offers.length ? (
            <p className="text-muted-foreground">
              No verified offer facts were found in this capture. Check the archived source for
              prices that the collection missed.
            </p>
          ) : null}
          {offers.map((offer) => {
            const numeric = facts.facts.filter((fact) => fact.offer === offer);
            const policies = facts.policies.filter((policy) => policy.offer === offer);
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)] gap-3"
                key={offer === null ? "unattributed" : `offer:${offer}`}
              >
                <h3 className="text-base">{offer ?? "Offer not established"}</h3>
                {offer === null ? (
                  <p className="text-muted-foreground">
                    These facts cannot be matched to an offer across captures.
                  </p>
                ) : null}
                {numeric.length ? (
                  <DataTable columns={["Fact", "Published value", "Terms", "Source evidence"]}>
                    {numeric.map((fact, index) => (
                      <DataRow key={`${fact.key}:${fact.evidence.start}:${index}`}>
                        <RowHeader>{formatToken(fact.key)}</RowHeader>
                        <DataCell>
                          <strong>{factValue(fact)}</strong>
                          {fact.currency === "DOLLAR_UNSPECIFIED" ? (
                            <CellNote>Dollar currency not established</CellNote>
                          ) : null}
                          {(fact.key.endsWith("_rate") || fact.key === "credit_conversion") &&
                          (fact.quantity === null || fact.quantityUnit === null) ? (
                            <CellNote>Rate quantity not established</CellNote>
                          ) : null}
                        </DataCell>
                        <DataCell>
                          {billingLabels[fact.billing]}
                          <CellNote>{periodLabels[fact.period]}</CellNote>
                        </DataCell>
                        <DataCell>
                          <EvidenceToggle text={fact.evidence.text} />
                        </DataCell>
                      </DataRow>
                    ))}
                  </DataTable>
                ) : null}
                {policies.length ? (
                  <DataTable columns={["Policy", "Answer", "Source evidence"]}>
                    {policies.map((policy) => (
                      <DataRow key={policy.key}>
                        <RowHeader>{getPricingChoiceLabel(policy.key)}</RowHeader>
                        <DataCell className={answerTone(policy.choice)}>
                          {formatToken(policy.choice)}
                        </DataCell>
                        <DataCell>
                          {policy.evidence ? (
                            <EvidenceToggle text={policy.evidence.text} />
                          ) : policy.choice === "not_disclosed" ? (
                            "No disclosure found in this capture"
                          ) : (
                            "No accepted evidence"
                          )}
                        </DataCell>
                      </DataRow>
                    ))}
                  </DataTable>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Missing disclosure does not establish product absence. Unknown amounts are not zero.
            These facts do not estimate a total bill.
          </p>
          <Disclosure summary="Collection details" className="mt-0">
            <p className="font-mono text-2xs text-muted-foreground">
              {facts.version} · {facts.model ?? "Model not recorded"}
            </p>
            <p className="text-muted-foreground">
              Code copies numeric values from the archived source. Jev classifies each fact and
              checks its evidence. Acceptance thresholds are not measured accuracy.
            </p>
          </Disclosure>
        </>
      ) : null}
      {sourceUrl ? (
        <p>
          <a href={serverUrl(sourceUrl)} target="_blank" rel="noreferrer">
            Read the archived source
          </a>
        </p>
      ) : null}
    </Panel>
  );
}

function EvidenceToggle({ text }: { text: string }) {
  return (
    <details>
      <summary className="w-fit cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
        Read evidence
      </summary>
      <Evidence className="mt-2">{text}</Evidence>
    </details>
  );
}
