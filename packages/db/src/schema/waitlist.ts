import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const waitlistEntry = sqliteTable(
  "waitlist_entry",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    check("waitlist_entry_email_normalized", sql`${table.email} = lower(trim(${table.email}))`),
  ],
);
