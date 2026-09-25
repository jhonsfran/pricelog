/**
 * Page context from the archived HTML: which UI state the capture shows and what the
 * vendor's own structured data says. Code reads markup; no model is involved.
 */
export type UiControl = {
  kind: "radio" | "tab" | "switch" | "pressed";
  group: string;
  options: { label: string; selected: boolean }[];
};
export type StructuredOffer = { name: string; price: string | null; currency: string | null };
export type PageContext = { controls: UiControl[]; offers: StructuredOffer[] };

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decode = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
    const point = Number.parseInt(code.slice(code[1] === "x" ? 2 : 1), code[1] === "x" ? 16 : 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
const clean = (text: string) => decode(text).replace(/\s+/g, " ").trim();

export async function pageContext(html: string): Promise<PageContext> {
  const radios = new Map<string, { label: string; selected: boolean }[]>();
  const tabs: { label: string; selected: boolean }[] = [];
  const pressed: { label: string; selected: boolean }[] = [];
  const switches: UiControl[] = [];
  const jsonLd: string[] = [];

  // Labels wrap radio inputs on most pricing toggles; text inside the label names the option.
  let label: { text: string; radio?: { name: string; selected: boolean } } | null = null;
  let control: { text: string; kind: "tab" | "switch" | "pressed"; selected: boolean } | null =
    null;
  let script: string | null = null;

  const rewriter = new HTMLRewriter()
    .on("label", {
      element(element) {
        if ((element as unknown as { canHaveContent?: boolean }).canHaveContent === false) return;
        label = { text: "" };
        element.onEndTag(() => {
          const current = label;
          label = null;
          if (!current?.radio) return;
          const options = radios.get(current.radio.name) ?? [];
          options.push({ label: clean(current.text), selected: current.radio.selected });
          radios.set(current.radio.name, options);
        });
      },
      text(text) {
        if (label) label.text += text.text;
      },
    })
    .on('input[type="radio"]', {
      element(element) {
        const name = element.getAttribute("name");
        if (label && name) label.radio = { name, selected: element.hasAttribute("checked") };
      },
    })
    .on('[role="tab"], [role="switch"], [aria-pressed]', {
      element(element) {
        const role = element.getAttribute("role");
        const kind = role === "tab" ? "tab" : role === "switch" ? "switch" : "pressed";
        const state =
          kind === "tab"
            ? element.getAttribute("aria-selected")
            : kind === "switch"
              ? element.getAttribute("aria-checked")
              : element.getAttribute("aria-pressed");
        // Void elements such as <input role="switch"> have no end tag and no text label.
        if ((element as unknown as { canHaveContent?: boolean }).canHaveContent === false) return;
        control = { text: "", kind, selected: state === "true" };
        element.onEndTag(() => {
          const current = control;
          control = null;
          if (!current || !clean(current.text)) return;
          const option = { label: clean(current.text), selected: current.selected };
          if (current.kind === "tab") tabs.push(option);
          else if (current.kind === "pressed") pressed.push(option);
          else switches.push({ kind: "switch", group: option.label, options: [option] });
        });
      },
      text(text) {
        if (control) control.text += text.text;
      },
    })
    .on('script[type="application/ld+json"]', {
      element(element) {
        if ((element as unknown as { canHaveContent?: boolean }).canHaveContent === false) return;
        script = "";
        element.onEndTag(() => {
          if (script) jsonLd.push(script);
          script = null;
        });
      },
      text(text) {
        if (script !== null) script += text.text;
      },
    });
  await rewriter.transform(new Response(html)).text();

  const controls: UiControl[] = [
    ...[...radios].map(([group, options]) => ({ kind: "radio" as const, group, options })),
    ...(tabs.length ? [{ kind: "tab" as const, group: "tabs", options: tabs }] : []),
    ...(pressed.length ? [{ kind: "pressed" as const, group: "pressed", options: pressed }] : []),
    ...switches,
  ].filter((item) => item.options.some((option) => option.label));

  return { controls, offers: structuredOffers(jsonLd) };
}

function structuredOffers(scripts: string[]): StructuredOffer[] {
  const offers: StructuredOffer[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const type = record["@type"];
    if (type === "Offer" && typeof record.name === "string") {
      offers.push({
        name: record.name,
        price:
          typeof record.price === "string" || typeof record.price === "number"
            ? String(record.price)
            : null,
        currency: typeof record.priceCurrency === "string" ? record.priceCurrency : null,
      });
    }
    for (const value of Object.values(record)) visit(value);
  };
  for (const script of scripts) {
    try {
      visit(JSON.parse(script));
    } catch {
      // Malformed vendor JSON-LD carries no evidence.
    }
  }
  return offers;
}
