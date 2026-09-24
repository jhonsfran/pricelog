import { describe, expect, it } from "vitest";
import { formatToken } from "./intelligence-profile";

describe("formatToken", () => {
  it("sets tokens in sentence case", () => {
    expect(formatToken("fixed_subscription")).toBe("Fixed subscription");
    expect(formatToken("not_disclosed")).toBe("Not disclosed");
  });

  it("keeps acronyms whole wherever they fall", () => {
    expect(formatToken("ai_native")).toBe("AI native");
    expect(formatToken("sales_ai_copilot")).toBe("Sales AI copilot");
    expect(formatToken("developer-apis")).toBe("Developer APIs");
  });

  it("returns an empty label for an empty token", () => {
    expect(formatToken("")).toBe("");
  });
});
