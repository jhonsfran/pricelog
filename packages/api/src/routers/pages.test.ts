import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { appRouter } from "./index";
import { ownedPageCondition, provisionOwnedPage } from "./pages";

describe("owner authorization", () => {
  it("constrains page access by both page and owner", () => {
    const condition = ownedPageCondition("page-a", "user-b");
    const query = new SQLiteDialect().sqlToQuery(condition!);

    expect(query.sql).toContain('"page"."id" = ?');
    expect(query.sql).toContain('"page"."owner_user_id" = ?');
    expect(query.params).toEqual(["page-a", "user-b"]);
  });

  it("exposes owner run operations only inside the protected pages router", () => {
    expect(Object.keys(appRouter.pages)).toEqual(
      expect.arrayContaining(["listOwned", "create", "getOwned", "triggerRun", "getRun"]),
    );
  });
});

describe("page provisioning", () => {
  const ownedPage = {
    id: "page-a",
    ownerUserId: "user-a",
    normalizedDomain: "example.com",
    canonicalUrl: "https://example.com/pricing",
    slug: "example.com",
    state: "pending" as const,
  };

  it("repairs and initializes an existing page owned by the caller", async () => {
    const calls: string[] = [];

    const result = await provisionOwnedPage(
      { record: ownedPage, requestedByUserId: "user-a" },
      {
        findByDomain: async () => ownedPage,
        createRecords: async () => calls.push("create"),
        ensureOwnerState: async () => calls.push("owner-state"),
        initializeAndStart: async () => calls.push("initialize"),
      },
    );

    expect(result).toBe(ownedPage);
    expect(calls).toEqual(["owner-state", "initialize"]);
  });

  it("rejects an existing page owned by another user", async () => {
    const calls: string[] = [];

    await expect(
      provisionOwnedPage(
        { record: ownedPage, requestedByUserId: "user-b" },
        {
          findByDomain: async () => ownedPage,
          createRecords: async () => calls.push("create"),
          ensureOwnerState: async () => calls.push("owner-state"),
          initializeAndStart: async () => calls.push("initialize"),
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(calls).toEqual([]);
  });

  it("continues provisioning after losing the domain insert race", async () => {
    const calls: string[] = [];
    let lookup = 0;

    await expect(
      provisionOwnedPage(
        { record: ownedPage, requestedByUserId: "user-a" },
        {
          findByDomain: async () => (++lookup === 1 ? null : ownedPage),
          createRecords: async () => {
            calls.push("create");
            throw new Error("unique constraint");
          },
          ensureOwnerState: async () => calls.push("owner-state"),
          initializeAndStart: async () => calls.push("initialize"),
        },
      ),
    ).resolves.toBe(ownedPage);
    expect(calls).toEqual(["create", "owner-state", "initialize"]);
  });
});
