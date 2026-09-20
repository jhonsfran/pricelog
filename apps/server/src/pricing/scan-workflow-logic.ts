import type { JevAnswer, PersistedQuestion } from "./types";

type JevResponse = {
  answers: Record<
    string,
    {
      score: number;
      confidence: number;
      legend?: Record<string, string>;
      probabilities: Record<string, number>;
    }
  >;
};

export function artifactKeys(normalizedDomain: string, runId: string) {
  const prefix = `pages/${normalizedDomain}/runs/${runId}`;
  return {
    htmlKey: `${prefix}/page.html`,
    screenshotKey: `${prefix}/page.png`,
    contentKey: `${prefix}/page.md`,
  };
}

export function parseJevAnswers(response: unknown, questions: PersistedQuestion[]): JevAnswer[] {
  if (!response || typeof response !== "object" || !("answers" in response)) {
    throw new Error("Jev returned no answers");
  }
  const answers = (response as JevResponse).answers;
  return questions.map((question) => {
    const value = answers[question.key];
    if (
      !value ||
      !Number.isFinite(value.score) ||
      !Number.isFinite(value.confidence) ||
      !value.probabilities
    ) {
      throw new Error(`Jev returned an invalid answer for ${question.key}`);
    }
    return {
      key: question.key,
      score: value.score,
      confidence: value.confidence,
      legend:
        value.legend ?? Object.fromEntries(question.criteria.map((label, index) => [index, label])),
      probabilities: value.probabilities,
    };
  });
}
