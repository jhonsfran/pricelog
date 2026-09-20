import { SQLiteDialect, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { descendingCursorCondition } from "./pagination";

const item = sqliteTable("item", {
  id: text("id").notNull(),
  createdAt: integer("created_at").notNull(),
});

describe("descendingCursorCondition", () => {
  it("uses the id as the timestamp tie-breaker", () => {
    const condition = descendingCursorCondition(item.createdAt, item.id, {
      createdAt: 100,
      id: "item-b",
    });
    const query = new SQLiteDialect().sqlToQuery(condition);

    expect(query.sql).toContain('"item"."created_at" < ?');
    expect(query.sql).toContain('"item"."created_at" = ?');
    expect(query.sql).toContain('"item"."id" < ?');
    expect(query.params).toEqual([100, 100, "item-b"]);
  });
});
