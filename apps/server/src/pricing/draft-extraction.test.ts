import { describe, expect, it } from "vitest";
import { DRAFT_RECOVERY_PARTS } from "./draft-snapshot";
import {
  draftSourceChunks,
  markdownExcerptHtml,
  mergeFeatureParts,
  parseDraftPart,
} from "./draft-extraction";

describe("bounded draft extraction", () => {
  it("covers a long UTF-8 feature source with small requests", () => {
    const features = DRAFT_RECOVERY_PARTS[3];
    const lines = Array.from({ length: 240 }, (_, index) => `Feature ${index}: €10 per month`);
    const chunks = draftSourceChunks(lines.join("\n"), features);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 6 * 1024)).toBe(
      true,
    );
    expect(chunks.join("\n")).toBe(lines.join("\n"));
    expect(markdownExcerptHtml("A < B & C")).toContain("A &lt; B &amp; C");
  });

  it("rejects truncated output before it enters the merged draft", () => {
    const offers = DRAFT_RECOVERY_PARTS[2];
    expect(() =>
      parseDraftPart(
        {
          success: true,
          result: {
            choices: [{ finish_reason: "length", message: { content: '{"offers":[]}' } }],
          },
        },
        offers,
      ),
    ).toThrow("did not complete");
  });

  it("merges repeated feature cells and marks conflicting claims unknown", () => {
    expect(
      mergeFeatureParts([
        [
          {
            name: "Seats",
            availability: [{ offer: "Pro", status: "included", limit_raw: "5" }],
          },
        ],
        [
          {
            name: "Seats",
            availability: [{ offer: "Pro", status: "limited", limit_raw: "10" }],
          },
        ],
      ]),
    ).toEqual([
      {
        name: "Seats",
        availability: [{ offer: "Pro", status: "unknown", limit_raw: null }],
      },
    ]);
  });
});
