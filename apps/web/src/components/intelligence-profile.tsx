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
}: {
  choices: DisplayChoice[];
  signals: DisplaySignal[];
  tags: string[];
  rubricId?: string;
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
    <section className="intelligence-card" aria-labelledby="intelligence-title">
      <div className="section-kicker">
        <span id="intelligence-title">COMMERCIAL PROFILE</span>
      </div>
      {current ? (
        <div className="choice-group">
          <h3 className="choice-group-label">Charging structure</h3>
          <p className="benchmark-meta">
            Components can overlap. Not established describes the page, not product absence.
          </p>
          <div className="intelligence-choices">
            {CHARGING_SIGNAL_KEYS.map((key) => {
              const probability = signals.find((signal) => signal.key === key)?.probability;
              const state =
                probability === undefined
                  ? "Uncertain"
                  : probability >= TAG_PROBABILITY_THRESHOLD
                    ? "Stated"
                    : probability <= NOT_ESTABLISHED_PROBABILITY_THRESHOLD
                      ? "Not established"
                      : "Uncertain";
              return (
                <div key={key}>
                  <span>{getPricingSignalMetadata(key)?.label}</span>
                  <strong>{state}</strong>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="benchmark-meta">
          Historical rubric. These answers do not enter current practice comparisons.
        </p>
      )}
      {groups.map((group) => (
        <div className="choice-group" key={group.key}>
          <h3 className="choice-group-label">{group.label}</h3>
          <div className="intelligence-choices">
            {group.items.map((item) => (
              <div key={item.key}>
                <span>{getPricingChoiceLabel(item.key)}</span>
                <strong>{formatToken(item.choice)}</strong>
                {item.choice !== "uncertain" ? (
                  <small>{Math.round(item.confidence * 100)}% confidence</small>
                ) : (
                  <small>No accepted classification</small>
                )}
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
