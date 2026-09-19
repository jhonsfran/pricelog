import { createAuth as createConfiguredAuth } from "@my-better-t-app/auth";
import { type Database, createDb } from "@my-better-t-app/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(ENV, database ?? (await getDb()));
}
