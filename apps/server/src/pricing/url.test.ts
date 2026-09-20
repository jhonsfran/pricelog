import { describe, expect, it } from "vitest";

import { InvalidPricingUrlError, normalizePricingUrl } from "./url";

const publicDns = async () => ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"];

describe("normalizePricingUrl", () => {
  it("normalizes the domain but keeps path and query", async () => {
    await expect(
      normalizePricingUrl("https://WWW.Example.com./pricing?currency=eur#plans", publicDns),
    ).resolves.toEqual({
      canonicalUrl: "https://example.com/pricing?currency=eur",
      normalizedDomain: "example.com",
    });
  });

  it("keeps non-www subdomains distinct", async () => {
    const result = await normalizePricingUrl("https://pricing.example.com/", publicDns);
    expect(result.normalizedDomain).toBe("pricing.example.com");
  });

  it.each([
    "http://example.com/pricing",
    "https://user:pass@example.com/pricing",
    "https://example.com:8443/pricing",
    "https://localhost/pricing",
    "https://service.internal/pricing",
    "https://127.0.0.1/pricing",
    "https://[::1]/pricing",
  ])("rejects unsafe input %s", async (input) => {
    await expect(normalizePricingUrl(input, publicDns)).rejects.toBeInstanceOf(
      InvalidPricingUrlError,
    );
  });

  it("rejects a hostname with any private DNS answer", async () => {
    await expect(
      normalizePricingUrl("https://example.com/pricing", async () => ["93.184.216.34", "10.0.0.8"]),
    ).rejects.toMatchObject({ code: "non_public_address" });
  });
});
