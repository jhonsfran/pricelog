import {
  getPricingChoiceLabel,
  getPricingSignalMetadata,
  groupPricingChoices,
  pricingTagPriority,
  TAG_PROBABILITY_THRESHOLD,
} from "@my-better-t-app/api/pricing-intelligence";

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
}: {
  choices: DisplayChoice[];
  signals: DisplaySignal[];
  tags: string[];
}) {
  const positiveSignals = signals.flatMap((signal) => {
    const metadata = getPricingSignalMetadata(signal.key);
    return signal.probability >= TAG_PROBABILITY_THRESHOLD && metadata?.showInProfile
      ? [{ ...signal, label: metadata.label }]
      : [];
  });
  // Ten flat classifications read as a wall. Grouped, a founder can find the
  // two that bear on the decision they are making right now.
  const groups = groupPricingChoices(choices);

  return (
    <section className="intelligence-card" aria-labelledby="intelligence-title">
      <div className="section-kicker">
        <span id="intelligence-title">COMMERCIAL PROFILE</span>
      </div>
      {groups.map((group) => (
        <div className="choice-group" key={group.key}>
          <h3 className="choice-group-label">{group.label}</h3>
          <div className="intelligence-choices">
            {group.items.map((item) => (
              <div key={item.key}>
                <span>{getPricingChoiceLabel(item.key)}</span>
                <strong>{formatToken(item.choice)}</strong>
                <small>{Math.round(item.confidence * 100)}% confidence</small>
              </div>
            ))}
          </div>
        </div>
      ))}
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
            <span key={signal.key}>{signal.label}</span>
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
