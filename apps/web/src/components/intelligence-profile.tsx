import {
  getPricingChoiceLabel,
  CHARGING_SIGNAL_KEYS,
  PRACTICE_CHOICE_KEYS,
  PRICING_INTELLIGENCE_RUBRIC_ID,
  getPricingSignalMetadata,
  groupPricingChoices,
  pricingTagPriority,
  TAG_PROBABILITY_THRESHOLD,
  NOT_ESTABLISHED_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";
import { cn } from "@my-better-t-app/ui/lib/utils";
import type { ReactNode } from "react";
import { Definitions, Disclosure, SectionHeading, Tag } from "./page";
import { Panel } from "./panel";

type DisplayChoice = {
  key: string;
  choice: string;
  confidence: number;
};

type DisplaySignal = {
  key: string;
  probability: number;
};

export function IntelligenceProfile({
  choices,
  signals,
  tags,
  rubricId,
  children,
}: {
  choices: DisplayChoice[];
  signals: DisplaySignal[];
  tags: string[];
  rubricId?: string;
  children?: ReactNode;
}) {
  const positiveSignals = signals.flatMap((signal) => {
    const metadata = getPricingSignalMetadata(signal.key);
    return signal.probability >= TAG_PROBABILITY_THRESHOLD && metadata?.showInProfile
      ? [{ ...signal, label: metadata.label }]
      : [];
  });
  // Ten flat classifications read as a wall. Grouped, a founder can find the
  // two that bear on the decision they are making right now.
  const current = rubricId === PRICING_INTELLIGENCE_RUBRIC_ID;
  const groups = groupPricingChoices(
    current
      ? [
          ...choices,
          ...PRACTICE_CHOICE_KEYS.filter(
            (key) => !choices.some((choice) => choice.key === key),
          ).map((key) => ({ key, choice: "uncertain", confidence: 0 })),
        ]
      : choices,
  );

  return (
    <Panel layered role="region" aria-labelledby="intelligence-title">
      <SectionHeading id="intelligence-title" title="Commercial profile" className="min-h-0" />
      {current ? (
        <ChoiceGroup
          label="Charging structure"
          note="Components can overlap. Not established describes the page, not product absence."
          items={CHARGING_SIGNAL_KEYS.map((key) => {
            const probability = signals.find((signal) => signal.key === key)?.probability;
            const state =
              probability === undefined
                ? "uncertain"
                : probability >= TAG_PROBABILITY_THRESHOLD
                  ? "stated"
                  : probability <= NOT_ESTABLISHED_PROBABILITY_THRESHOLD
                    ? "not_established"
                    : "uncertain";
            return { key, label: getPricingSignalMetadata(key)?.label ?? key, choice: state };
          })}
        />
      ) : (
        <p className="text-muted-foreground">
          Historical rubric. These answers do not enter current practice comparisons.
        </p>
      )}
      {groups.map((group) => (
        <ChoiceGroup
          key={group.key}
          label={group.label}
          items={group.items.map((item) => ({
            key: item.key,
            label: getPricingChoiceLabel(item.key),
            choice: item.choice,
          }))}
        />
      ))}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Page tags">
          {tags.map((tag) => (
            <Tag key={tag}>{formatToken(tag)}</Tag>
          ))}
        </div>
      )}
      {positiveSignals.length > 0 && (
        <div className="kicker flex flex-wrap gap-x-4.5 gap-y-2 text-gray-11">
          {positiveSignals.map((signal) => (
            <span key={signal.key}>{signal.label}</span>
          ))}
        </div>
      )}
      <Disclosure summary="Collection details" className="mt-0 border-t pt-3">
        {children}
        <h3 className="mt-2 text-base">Classification confidence</h3>
        <Definitions
          items={groups
            .flatMap((group) => group.items)
            .map((item) => ({
              key: item.key,
              term: getPricingChoiceLabel(item.key),
              detail:
                item.choice === "uncertain"
                  ? "No accepted classification"
                  : `${Math.round(item.confidence * 100)}% confidence`,
            }))}
        />
      </Disclosure>
    </Panel>
  );
}

/**
 * One group of answers as a grid of cells. The answer carries its standing:
 * stated reads as signal, uncertain as a warning, and not established or
 * not disclosed recedes, because it describes the page, not the product.
 */
function ChoiceGroup({
  label,
  note,
  items,
}: {
  label: string;
  note?: string;
  items: { key: string; label: string; choice: string }[];
}) {
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm tracking-normal">{label}</h3>
        {note ? <p className="mt-1.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {/* Cells overlap their neighbours' borders, so a part-filled last row
          draws no rule across the empty columns. */}
      <div className="grid grid-cols-2 pt-px pl-px md:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="-mt-px -ml-px flex min-h-24 flex-col gap-2 border p-4">
            <span className="text-xs text-muted-foreground">{item.label}</span>
            <strong className={cn("text-base font-medium", answerTone(item.choice))}>
              {formatToken(item.choice)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function answerTone(choice: string) {
  if (choice === "stated") return "text-signal-11";
  if (choice === "uncertain" || choice === "unknown") return "text-warning-11";
  if (choice === "not_established" || choice === "not_disclosed" || choice === "not_applicable")
    return "text-muted-foreground";
  return "text-foreground";
}

const ACRONYMS: Record<string, string> = { ai: "AI", api: "API", apis: "APIs", hr: "HR", gb: "GB" };

/** "ai_native" → "AI native": sentence case, with acronyms kept whole. */
export function formatToken(value: string) {
  const words = value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.toLowerCase());
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

export function prioritizeTags(tags: string[]) {
  return [...tags].sort((left, right) => pricingTagPriority(left) - pricingTagPriority(right));
}
