import { describe, expect, it } from "vitest";
import { readCapturedState, structuredPriceData } from "./capture-state";

it("marks incomplete state captures so absent offers cannot become verified removals", () => {
  const html = `<script id="pricelog-state">${JSON.stringify({
    version: 1,
    complete: false,
    blocks: [{ label: "default", text: "Starter €19" }],
  })}</script>`;
  expect(readCapturedState(html)).toMatchObject({
    coverage: "partial",
    text: "## capture: partial\n\n## state: default\nStarter €19",
  });
});

describe("structured price data", () => {
  it("adds one line per schema.org offer declared in the page", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "0",
        offers: [
          { "@type": "Offer", name: "Polylane Free", price: "0" },
          { "@type": "Offer", name: "Polylane Starter", price: "80" },
        ],
      })}</script>
      <script type="application/ld+json">{"@type":"Organization","name":"Polylane"}</script>
      <script type="application/ld+json">{not json</script>
    </head><body></body></html>`;
    expect(structuredPriceData(html)).toBe(
      "## state: structured data\nPolylane Free: 0 USD\nPolylane Starter: 80 USD",
    );
  });

  it("returns nothing for a page without declared prices", () => {
    expect(structuredPriceData("<html><body>$20 per month</body></html>")).toBeNull();
  });
});
