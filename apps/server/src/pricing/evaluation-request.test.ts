import { describe, expect, it } from "vitest";
import { jevModelVersion, requireJevModelVersion } from "./evaluation-request";

describe("Jev model version", () => {
  it("reads the exact provider model and excludes aliases", () => {
    expect(jevModelVersion({ result: { model: "jev-1.13.0" } })).toBe("jev-1.13.0");
    expect(jevModelVersion({ model: "typesafe/jev" })).toBeNull();
  });
  it.each([{}, { model: "typesafe/jev" }, { result: { answers: {} } }])(
    "rejects an evaluation without an exact provider version",
    (response) => {
      expect(() => requireJevModelVersion(response)).toThrow(
        "Jev returned no exact provider model version",
      );
    },
  );
  it("rejects an unapproved model and returns the approved one", () => {
    expect(() => requireJevModelVersion({ model: "jev-2.0.0" })).toThrow("Unapproved Jev model");
    expect(requireJevModelVersion({ result: { model: "jev-1.13.0" } })).toBe("jev-1.13.0");
  });
});
