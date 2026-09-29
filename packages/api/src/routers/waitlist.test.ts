import { readFile, readdir } from "node:fs/promises";
import { URL } from "node:url";
import { createClient, type Client } from "@libsql/client";
import type { Database } from "@pricelog/db";
import { call } from "@orpc/server";
import { drizzle } from "drizzle-orm/libsql";
import { describe, expect, it } from "vitest";

import type { Context } from "../context";
import { waitlistRouter } from "./waitlist";

const migrations = new URL("../../../db/src/migrations/", import.meta.url);

async function waitlist() {
  const client = createClient({ url: "file::memory:" });
  for (const name of (await readdir(migrations)).filter((name) => /^\d/.test(name)).sort()) {
    await client.executeMultiple(
      await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"),
    );
  }
  const context = {
    db: drizzle({ client }) as unknown as Database,
    session: null,
    pageMonitor: {},
  } as Context;
  return {
    client,
    join: (email: string) => call(waitlistRouter.join, { email }, { context }),
  };
}

async function listed(client: Client) {
  const result = await client.execute("select email from waitlist_entry order by email");
  return result.rows.map((row) => ({ email: row.email }));
}

describe("waitlist", () => {
  it("keeps one normalized row per address and answers a repeat like a new join", async () => {
    const { client, join } = await waitlist();
    try {
      expect(await join(" Ada@Example.COM ")).toEqual({ email: "ada@example.com" });
      expect(await join("ada@example.com")).toEqual({ email: "ada@example.com" });
      await join("grace@example.org");

      expect(await listed(client)).toEqual([
        { email: "ada@example.com" },
        { email: "grace@example.org" },
      ]);
    } finally {
      client.close();
    }
  });

  it("rejects a malformed or over-long address and stores the corrected one", async () => {
    const { client, join } = await waitlist();
    try {
      await expect(join("ada@example")).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(join(`${"a".repeat(250)}@example.com`)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      await join("ada@example.com");

      expect(await listed(client)).toEqual([{ email: "ada@example.com" }]);
    } finally {
      client.close();
    }
  });
});
