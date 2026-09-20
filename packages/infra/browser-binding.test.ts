import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import { browserBinding } from "./browser-binding";

describe("browserBinding", () => {
  it("uses the remote Browser Run service in local development", () => {
    const binding = Effect.runSync(browserBinding);

    expect(binding.name).toBe("BROWSER");
    expect(binding.devRemote).toBe(true);
  });
});
