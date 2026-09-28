import { describe, expect, it } from "vitest";

import { isAllowedEmail, parseAllowedEmails, parseAllowedOrigins } from "./index";

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

describe("parseAllowedEmails", () => {
  it("normalizes, trims, and deduplicates the allowlist", () => {
    expect(parseAllowedEmails(" JHONSFRAN@gmail.com, ,jhonsfran@gmail.com ")).toEqual([
      "jhonsfran@gmail.com",
    ]);
  });

  it("matches emails without case sensitivity", () => {
    expect(isAllowedEmail(" JHONSFRAN@gmail.com ", "jhonsfran@gmail.com")).toBe(true);
    expect(isAllowedEmail("other@example.com", "jhonsfran@gmail.com")).toBe(false);
    expect(isAllowedEmail("jhonsfran@gmail.com", "")).toBe(false);
  });
});
