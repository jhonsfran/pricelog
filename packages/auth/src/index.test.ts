import { describe, expect, it } from "vitest";

import { parseAllowedOrigins } from "./index";

describe("parseAllowedOrigins", () => {
  it("accepts one origin", () => {
    expect(parseAllowedOrigins("http://localhost:3001")).toEqual(["http://localhost:3001"]);
  });

  it("parses, trims, and deduplicates an origin allowlist", () => {
    expect(
      parseAllowedOrigins("http://localhost:3001, https://app.example.com, http://localhost:3001"),
    ).toEqual(["http://localhost:3001", "https://app.example.com"]);
  });
});
