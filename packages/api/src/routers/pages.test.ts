import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { appRouter } from "./index";
import { ownedPageCondition } from "./pages";

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
