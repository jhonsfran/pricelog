import { describe, expect, it } from "vitest";

import { resolveLogEnvironment } from "./logging";

describe("resolveLogEnvironment", () => {
  it("treats the Alchemy dev worker as development", () => {
    expect(resolveLogEnvironment({ ALCHEMY_DEV: "true", NODE_ENV: "production" })).toBe(
      "development",
    );
  });

  it("uses the explicit pretty-log binding when available", () => {
    expect(resolveLogEnvironment({ LOG_FORMAT: "pretty", NODE_ENV: "production" })).toBe(
      "development",
    );
  });

  it("preserves production outside Alchemy dev", () => {
    expect(resolveLogEnvironment({ NODE_ENV: "production" })).toBe("production");
  });
});
