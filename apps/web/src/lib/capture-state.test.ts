// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAPTURE_STATE_SCRIPT } from "../../../server/src/pricing/capture-state";

const originalInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalInnerText)
    Object.defineProperty(HTMLElement.prototype, "innerText", originalInnerText);
  else Reflect.deleteProperty(HTMLElement.prototype, "innerText");
  document.body.innerHTML = "";
  document.getElementById("pricelog-state")?.remove();
  document.getElementById("pricelog-state-ready")?.remove();
});

describe("billing capture", () => {
  it("records annual billing for a checkbox with monthly and yearly labels", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <style>* { opacity: 1; }</style><meta id="pricelog-capture-ready">
      <main><h1>Pricing</h1><div>
        <input type="checkbox" id="billing" checked style="display:none">
        <label for="billing">Monthly</label><label for="billing">Yearly</label>
      </div><h2>Starter</h2><p id="price">€19 Per User/Month</p></main>`;
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() {
        return this.textContent;
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 100, 20),
    );
    const input = document.querySelector<HTMLInputElement>("#billing")!;
    input.addEventListener("change", () => {
      document.querySelector("#price")!.textContent = input.checked
        ? "€19 Per User/Month"
        : "€25 Per User/Month";
    });
    new Function(CAPTURE_STATE_SCRIPT)();
    await vi.advanceTimersByTimeAsync(5000);
    const captured = JSON.parse(document.getElementById("pricelog-state")!.textContent!);
    expect(captured.billingView).toBe("annual");
    expect(captured.blocks[0].label).toBe("default (selected: Yearly)");
    expect(captured.blocks[1]).toMatchObject({ label: "billing=Monthly" });
    expect(captured.blocks[1].text).toContain("€25 Per User/Month");
    expect(input.checked).toBe(true);
  });
});
