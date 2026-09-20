import {
  pricingTagPriority,
  PRICING_CHOICE_CATALOG,
  PRICING_SIGNAL_CATALOG,
  TAG_PROBABILITY_THRESHOLD,
  type PricingChoiceKey,
  type PricingSignalKey,
} from "@my-better-t-app/api/pricing-intelligence";

type DisplayChoice = {
  key: PricingChoiceKey;
  choice: string;
  confidence: number;
};

type DisplaySignal = {
  key: PricingSignalKey;
  probability: number;
};

export function IntelligenceProfile({
  choices,
  signals,
  tags,
}: {
  choices: DisplayChoice[];
  signals: DisplaySignal[];
  tags: string[];
}) {
  const positiveSignals = signals.filter(
    (signal) =>
      signal.probability >= TAG_PROBABILITY_THRESHOLD &&
      PRICING_SIGNAL_CATALOG[signal.key].showInProfile,
  );

  return (
    <section className="intelligence-card" aria-labelledby="intelligence-title">
      <div className="section-kicker">
        <span id="intelligence-title">COMMERCIAL PROFILE</span>
      </div>
      <div className="intelligence-choices">
        {choices.map((item) => (
          <div key={item.key}>
            <span>{PRICING_CHOICE_CATALOG[item.key].label}</span>
            <strong>{formatToken(item.choice)}</strong>
            <small>{Math.round(item.confidence * 100)}% confidence</small>
          </div>
        ))}
      </div>
      {tags.length > 0 && (
        <div className="tag-list" aria-label="Page tags">
          {tags.map((tag) => (
            <span className="page-tag" key={tag}>
              {formatToken(tag)}
            </span>
          ))}
        </div>
      )}
      {positiveSignals.length > 0 && (
        <div className="signal-list">
          {positiveSignals.map((signal) => (
            <span key={signal.key}>{PRICING_SIGNAL_CATALOG[signal.key].label}</span>
          ))}
        </div>
      )}
    </section>
  );
}

export function formatToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function prioritizeTags(tags: string[]) {
  return [...tags].sort((left, right) => pricingTagPriority(left) - pricingTagPriority(right));
}
