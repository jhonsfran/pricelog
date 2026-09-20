import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { page, pageOwnerState, pagePublicSummary } from "./pages";

describe("pricing page schema", () => {
  it("defines the central directory tables", () => {
    expect(getTableConfig(page).name).toBe("page");
    expect(getTableConfig(pagePublicSummary).name).toBe("page_public_summary");
    expect(getTableConfig(pageOwnerState).name).toBe("page_owner_state");
  });

  it("keeps public and owner projections separate", () => {
    expect(Object.keys(pagePublicSummary)).toEqual(
      expect.arrayContaining(["overallScore", "scores", "choices", "signals", "tags", "scannedAt"]),
    );
    expect(Object.keys(pageOwnerState)).toEqual(
      expect.arrayContaining(["activeRunId", "lastRunId", "lastRunStatus", "nextScanAt"]),
    );
    expect(Object.keys(pagePublicSummary)).not.toContain("activeRunId");
  });
});
