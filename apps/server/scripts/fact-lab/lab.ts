import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Shared paths and helpers for the dev-only fact lab. Nothing here ships in the Worker. */
export const LAB_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(LAB_DIR, "../../../..");
export const DATA_DIR = join(REPO_ROOT, "tmp/fact-lab");
export const CAPTURES_DIR = join(DATA_DIR, "captures");
export const CACHE_DIR = join(DATA_DIR, "cache");
export const RUNS_DIR = join(DATA_DIR, "runs");
export const GOLD_DIR = join(LAB_DIR, "gold");
export const EXPERIMENTS_LOG = join(LAB_DIR, "experiments.jsonl");

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readJsonIfExists<T>(path: string): T | null {
  return existsSync(path) ? readJson<T>(path) : null;
}

export function appendJsonl(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

/**
 * A fingerprint over source files and settings; any change yields a new variant identity.
 * Paths are hashed relative to the repository so the identity is the same in every checkout.
 */
export function fingerprint(files: string[], settings: unknown): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(relative(REPO_ROOT, file));
    hash.update(readFileSync(file));
  }
  hash.update(JSON.stringify(settings));
  return hash.digest("hex");
}

export function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "true";
}
