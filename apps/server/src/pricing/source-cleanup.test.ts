import { describe, expect, it } from "vitest";
import { addAccessiblePriceLabels, trimCookieConsentMarkdown } from "./source-cleanup";

describe("accessible price labels", () => {
  const tree = {
    role: "RootWebArea",
    children: [
      {
        role: "group",
        children: [
          { role: "heading", name: "Business" },
          { role: "img", name: "$90" },
          { role: "StaticText", name: "per month" },
          { role: "heading", name: "Key Features" },
        ],
      },
      {
        role: "group",
        children: [
          { role: "heading", name: "Advanced" },
          { role: "img", name: "$300" },
          { role: "StaticText", name: "per month" },
        ],
      },
    ],
  };

  it("restores prices omitted from rendered Markdown within their plans", () => {
    const markdown = "# Pricing\n\n### Business\n\nper month\n\n### Advanced\n\nper month";
    expect(addAccessiblePriceLabels(markdown, tree)).toBe(
      "# Pricing\n\n### Business\n\n$90\n\nper month\n\n### Advanced\n\n$300\n\nper month",
    );
  });

  it("does not duplicate a published price or attribute an ungrouped label", () => {
    const markdown = "# Pricing\n\n### Business\n\n$90 per month";
    expect(addAccessiblePriceLabels(markdown, tree)).toBe(markdown);
    expect(
      addAccessiblePriceLabels(markdown, {
        role: "RootWebArea",
        children: [
          { role: "heading", name: "Business" },
          { role: "img", name: "$300" },
        ],
      }),
    ).toBe(markdown);
  });
});

describe("cookie consent Markdown cleanup", () => {
  it("removes a trailing consent panel and cookie reports without losing prices", () => {
    const source = [
      "# Pricing",
      "### Starter",
      "£20/mo, billed annually",
      "### Business",
      "£572/mo, billed annually",
      "",
      "This website uses cookies",
      "We use cookies to analyse traffic.",
      "Accept all",
      "Decline all",
      "Cookie declaration",
      "Cookie report",
      "| Name | Provider / Domain | Expiration | Description |",
      "| --- | --- | --- | --- |",
      "| _ga | Example | 1 year | Analytics |",
    ].join("\n");

    expect(trimCookieConsentMarkdown(source)).toBe(
      "# Pricing\n### Starter\n£20/mo, billed annually\n### Business\n£572/mo, billed annually",
    );
  });

  it("removes a leading consent panel and keeps the page after its actions", () => {
    const source = [
      "---",
      'title: "Fathom pricing"',
      "---",
      "",
      "![](https://cdn-cookieyes.com/assets/images/close.svg)",
      "",
      "We use cookies 🍪",
      "",
      "We use cookies to enhance your browsing experience.",
      "Customize Reject All Accept All",
      "Customize Consent Preferences ![](https://cdn-cookieyes.com/assets/images/close.svg)",
      "Cookie _ga",
      "Duration 1 year",
      "Reject All Save My Preferences Accept All",
      "",
      "[Fathom](/)",
      "# Pricing for teams",
      "$15 /month / per user",
    ].join("\n");

    expect(trimCookieConsentMarkdown(source)).toBe(
      '---\ntitle: "Fathom pricing"\n---\n\n[Fathom](/)\n# Pricing for teams\n$15 /month / per user',
    );
  });

  it("removes a bounded in-page consent panel and keeps later pricing terms", () => {
    const source = [
      "# Pricing",
      "$10 per month",
      "This website uses cookies",
      "We use cookies for analytics.",
      "Reject All Save My Preferences Accept All",
      "## Annual billing",
      "$100 per year",
    ].join("\n");
    expect(trimCookieConsentMarkdown(source)).toBe(
      "# Pricing\n$10 per month\n## Annual billing\n$100 per year",
    );
  });

  it("recognizes cookie headings with a following sentence", () => {
    const source =
      "# Pricing\n$20 per month\nThis website uses cookies to improve your experience.\nReject All Accept All";
    expect(trimCookieConsentMarkdown(source)).toBe("# Pricing\n$20 per month");
  });

  it("leaves unrelated and ambiguous cookie text unchanged", () => {
    const sources = [
      "# Pricing\n$20 per month\n### Are cookies required?\nNo cookies are needed to buy.",
      "# Pricing\n$20 per month\nThis website uses cookies\nA customer example mentions cookies.",
      "# Pricing\n$20 per month\nCookie report\nA product report about cookies.",
    ];
    for (const source of sources) expect(trimCookieConsentMarkdown(source)).toBe(source);
  });
});
