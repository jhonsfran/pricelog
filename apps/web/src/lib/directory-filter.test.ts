import { describe, expect, it } from "vitest";
import { hasDirectoryFilter, parseDirectoryFilter, parsePageSearch } from "./directory-filter";

describe("parseDirectoryFilter", () => {
  it("treats All AI applications as no category while browsing", () => {
    const filter = parseDirectoryFilter({ cohort: "ai_applications" });
    expect(filter.cohort).toBeUndefined();
    expect(hasDirectoryFilter(filter)).toBe(false);
  });

  it("keeps a single category, and the umbrella cohort behind a chart's answer", () => {
    expect(parseDirectoryFilter({ cohort: "category:voice_agents" }).cohort).toBe(
      "category:voice_agents",
    );
    expect(
      parseDirectoryFilter({ cohort: "ai_applications", signal: "charges_per_seat" }).cohort,
    ).toBe("ai_applications");
  });

  it("reads the version a page record shows", () => {
    expect(parsePageSearch({ v: "run-1", cohort: "ai_applications" })).toMatchObject({
      v: "run-1",
      cohort: undefined,
    });
    expect(parsePageSearch({ v: 3 }).v).toBeUndefined();
  });
});
