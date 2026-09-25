import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPTURES_DIR, REPO_ROOT, readJson, sha256, writeJson } from "./lab";
import { mkdirSync, copyFileSync } from "node:fs";

export type CaptureMeta = {
  domain: string;
  sha256: string;
  bytes: number;
  runs: { runId: string; uploaded: number }[];
};
export type Capture = CaptureMeta & { markdown: string; htmlPath: string; screenshotPath: string };

const R2_DIR = join(REPO_ROOT, "packages/infra/.alchemy/local/r2");

type R2Row = { key: string; blob_id: string; uploaded: number };

/** Copy every distinct archived capture of a domain out of local R2, read-only. */
export function exportCaptures(domain: string): CaptureMeta[] {
  const metadataDir = join(R2_DIR, "cloudflare-runtime-R2BucketObject");
  const blobRoot = readdirSync(R2_DIR).find((name) => name.startsWith("dev_"));
  if (!blobRoot) throw new Error("Local R2 blob directory not found");
  const rows: R2Row[] = [];
  for (const file of readdirSync(metadataDir)) {
    if (!file.endsWith(".sqlite") || file === "metadata.sqlite") continue;
    const output = execFileSync("sqlite3", [
      "-readonly",
      "-json",
      join(metadataDir, file),
      `select key, blob_id, uploaded from _mf_objects where key like 'pages/${domain.replaceAll("'", "")}/runs/%' order by uploaded`,
    ]).toString();
    if (output.trim()) rows.push(...(JSON.parse(output) as R2Row[]));
  }
  const runs = new Map<string, Record<string, R2Row>>();
  for (const row of rows) {
    const [, , , runId, name] = row.key.split("/");
    if (!runId || !name) continue;
    runs.set(runId, { ...runs.get(runId), [name]: row });
  }
  const byContent = new Map<string, CaptureMeta>();
  for (const [runId, files] of runs) {
    const md = files["page.md"];
    if (!md || !files["page.html"] || !files["page.png"]) continue;
    const markdown = readFileSync(join(R2_DIR, blobRoot, "blobs", md.blob_id));
    const hash = sha256(markdown);
    const existing = byContent.get(hash);
    if (existing) {
      existing.runs.push({ runId, uploaded: md.uploaded });
      continue;
    }
    const target = join(CAPTURES_DIR, hash);
    mkdirSync(target, { recursive: true });
    for (const name of ["page.md", "page.html", "page.png"] as const)
      copyFileSync(join(R2_DIR, blobRoot, "blobs", files[name]!.blob_id), join(target, name));
    byContent.set(hash, {
      domain,
      sha256: hash,
      bytes: markdown.byteLength,
      runs: [{ runId, uploaded: md.uploaded }],
    });
  }
  const metas = [...byContent.values()].sort((a, b) => a.runs[0]!.uploaded - b.runs[0]!.uploaded);
  for (const meta of metas) writeJson(join(CAPTURES_DIR, meta.sha256, "meta.json"), meta);
  writeJson(
    join(CAPTURES_DIR, `${domain}.json`),
    metas.map((meta) => meta.sha256),
  );
  return metas;
}

export function captureShas(domain: string): string[] {
  const index = join(CAPTURES_DIR, `${domain}.json`);
  if (!existsSync(index)) exportCaptures(domain);
  return readJson<string[]>(index);
}

export function loadCapture(hash: string): Capture {
  const dir = join(CAPTURES_DIR, hash);
  const meta = readJson<CaptureMeta>(join(dir, "meta.json"));
  const markdown = readFileSync(join(dir, "page.md"), "utf8");
  if (sha256(markdown) !== hash) throw new Error(`Capture ${hash} failed its content check`);
  return {
    ...meta,
    markdown,
    htmlPath: join(dir, "page.html"),
    screenshotPath: join(dir, "page.png"),
  };
}

if (import.meta.main) {
  for (const domain of process.argv.slice(2)) {
    const metas = exportCaptures(domain);
    console.log(
      domain,
      metas.map(
        (meta) => `${meta.sha256.slice(0, 12)} (${meta.bytes} B, ${meta.runs.length} runs)`,
      ),
    );
  }
}
