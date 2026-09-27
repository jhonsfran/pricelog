import { createAuth as createConfiguredAuth } from "@pricelog/auth";
import { type Database, createDb } from "@pricelog/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(ENV, database ?? (await getDb()));
}
