import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { planOffers } from "../packages/db/src/pricing-snapshot.ts";
import { confirmChanges } from "../apps/server/src/pricing/snapshot-changes.ts";

const normalize = (text) =>
  text
    .replace(/\s*\|\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function billingInLabel(label) {
  const monthly = /\bmonth(?:ly)?\b/i.test(label);
  const annual = /\b(?:year(?:ly)?|annual(?:ly)?)\b/i.test(label);
  return monthly === annual ? null : monthly ? "monthly" : "annual";
}

export function snapshotFindings(snapshot) {
  if (!snapshot || snapshot.status !== "collected") return [];
  const findings = [];
  const plans = planOffers(snapshot);
  const addOns = snapshot.offers.filter(
    (offer) => offer.prices.length && offer.prices.every((price) => price.kind === "add_on"),
  );
  if (addOns.length)
    findings.push({
      rule: "add_ons_counted_as_plans",
      severity: "confirmed",
      names: addOns.map((offer) => offer.name),
    });
  const featureOnly = plans
    .filter((offer) => !snapshot.offers.includes(offer))
    .map((offer) => offer.name);
  if (featureOnly.length)
    findings.push({ rule: "feature_only_plan_names", severity: "review", names: featureOnly });
  if (!snapshot.features.length) findings.push({ rule: "no_features", severity: "review" });
  if (!snapshot.offers.length && !snapshot.features.length && !snapshot.shared_prices?.length)
    findings.push({ rule: "empty_collected_snapshot", severity: "confirmed" });
  for (const offer of snapshot.offers) {
    if (/^(?:default|unknown|unnamed)$/i.test(offer.name))
      findings.push({ rule: "placeholder_offer_name", severity: "review", offer: offer.name });
    const groups = new Map();
    for (const price of offer.prices) {
      if (price.kind !== "flat" && price.kind !== "per_seat") continue;
      const key = [price.kind, price.billing, price.period].join(":");
      const prices = groups.get(key) ?? [];
      prices.push(price);
      groups.set(key, prices);
    }
    for (const [key, prices] of groups) {
      if (
        new Set(prices.map((price) => price.price_numeric).filter((amount) => amount !== null))
          .size > 1
      )
        findings.push({
          rule: "multiple_prices_same_billing",
          severity: "review",
          offer: offer.name,
          key,
          prices,
        });
    }
  }
  return findings;
}

export function archiveFindings(snapshot, text) {
  if (!snapshot || snapshot.status !== "collected") return [];
  const findings = [];
  const blocks = text.split(/^## state: (.+)$/m);
  const stateName = (value) => normalize(value.replace(/ \(selected: .*\)$/, ""));
  if (/^## capture: partial$/m.test(text))
    findings.push({ rule: "partial_capture", severity: "review" });
  for (const offer of snapshot.offers) {
    for (const price of offer.prices) {
      if (price.kind !== "flat" && price.kind !== "per_seat") continue;
      const index = blocks.findIndex(
        (value, index) => index % 2 === 1 && stateName(value) === stateName(price.state),
      );
      if (index < 0 || !normalize(blocks[index + 1] ?? "").includes(normalize(price.price_raw)))
        continue;
      const label =
        /\bbilling=([^;]+)/i.exec(blocks[index])?.[1] ??
        (/^default\b/i.test(blocks[index])
          ? /\(selected: ([^)]+)\)/i.exec(blocks[index])?.[1]
          : null);
      const expected = label
        ? billingInLabel(label)
        : /^default\b/i.test(price.state) && snapshot.billing_view !== "unknown"
          ? snapshot.billing_view
          : null;
      const explicit = /\bbilled\s+(annually|yearly|monthly)\b/i.exec(price.price_raw)?.[1];
      const quotedBilling = explicit ? billingInLabel(explicit) : null;
      if (
        (expected && expected !== price.billing) ||
        (quotedBilling && quotedBilling !== price.billing)
      )
        findings.push({
          rule: "billing_evidence_mismatch",
          severity: "confirmed",
          offer: offer.name,
          expected: quotedBilling ?? expected,
          price,
        });
      if (
        label &&
        /\bmonth(?:ly)?\b/i.test(label) &&
        /\b(?:year(?:ly)?|annual(?:ly)?)\b/i.test(label)
      )
        findings.push({
          rule: "ambiguous_billing_control",
          severity: "review",
          offer: offer.name,
          label,
          price,
        });
    }
  }
  return findings;
}

export function rejectedChanges(changes, beforeText, afterText) {
  const accepted = new Set(
    confirmChanges(changes, beforeText, afterText).map((change) => change.key),
  );
  return changes.filter((change) => !accepted.has(change.key));
}

export function summarize(pages) {
  const rules = {};
  const statuses = {};
  for (const page of pages) {
    statuses[page.status] = (statuses[page.status] ?? 0) + 1;
    for (const rule of new Set(page.findings.map((finding) => finding.rule)))
      rules[rule] = (rules[rule] ?? 0) + 1;
  }
  return {
    pages: pages.length,
    statuses,
    confirmedPages: pages.filter((page) =>
      page.findings.some((finding) => finding.severity === "confirmed"),
    ).length,
    reviewPages: pages.filter((page) =>
      page.findings.some((finding) => finding.severity === "review"),
    ).length,
    rules,
  };
}

async function readResponse(url, input) {
  const response = await fetch(url, {
    ...(input
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ json: input }),
        }
      : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

export async function readDirectory(rpc) {
  const pages = new Map();
  const cursors = new Set();
  let cursor;
  let total;
  do {
    const batch = await rpc("directory/list", { limit: 50, ...(cursor ? { cursor } : {}) });
    total = batch.total;
    for (const page of batch.items) pages.set(page.id, page);
    cursor = batch.nextCursor;
    if (cursor) {
      const key = JSON.stringify(cursor);
      if (cursors.has(key)) throw new Error("Directory repeated a pagination cursor");
      cursors.add(key);
    }
  } while (cursor);
  if (pages.size !== total)
    throw new Error(`Directory changed during the audit: read ${pages.size} of ${total} pages`);
  return [...pages.values()];
}

async function auditPage(page, { rpc, apiUrl, archives, evidenceDir, offline }) {
  const record = {
    slug: page.slug,
    pageId: page.id,
    url: `https://usepricelog.com/pages/${encodeURIComponent(page.slug)}`,
    status: page.snapshot?.status ?? "missing",
    offers: page.snapshot?.offers.length ?? 0,
    features: page.snapshot?.features.length ?? 0,
    findings: snapshotFindings(page.snapshot),
  };
  if (!archives) return record;
  const save = async (name, value) =>
    writeFile(
      resolve(evidenceDir, `${encodeURIComponent(page.slug)}-${name}`),
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    );
  const load = async (name, request) => {
    if (!offline) return request();
    const text = await readFile(
      resolve(evidenceDir, `${encodeURIComponent(page.slug)}-${name}`),
      "utf8",
    );
    return name.endsWith(".json") ? JSON.parse(text) : text;
  };
  try {
    const metadata = await load("metadata.json", () =>
      rpc("directory/getBySlug", { slug: page.slug }),
    );
    if (!metadata) throw new Error("Published page has no metadata");
    await save("metadata.json", metadata);
    const version = await load(
      "version.json",
      () =>
        metadata.latestVersion ??
        rpc("directory/version", {
          slug: page.slug,
          runId: metadata.versions[0]?.runId ?? metadata.runId,
        }),
    );
    if (!version) throw new Error("Published page has no latest version");
    await save("version.json", version);
    record.findings = snapshotFindings(version.snapshot);
    if (JSON.stringify(page.snapshot) !== JSON.stringify(version.snapshot))
      record.findings.push({ rule: "summary_version_mismatch", severity: "review" });
    record.status = version.snapshot?.status ?? "missing";
    record.offers = version.snapshot?.offers.length ?? 0;
    record.features = version.snapshot?.features.length ?? 0;
    record.runId = version.runId;
    record.capturedAt = version.capturedAt;
    record.sourceUrl = `${apiUrl}/api/public/pages/${encodeURIComponent(page.id)}/runs/${encodeURIComponent(version.runId)}/source`;
    const text = await load("source.txt", async () =>
      (await readResponse(record.sourceUrl)).text(),
    );
    await save("source.txt", text);
    record.states = [...text.matchAll(/^## state: (.+)$/gm)].map((match) => match[1]);
    record.coverageRecorded = /^## capture: partial$/m.test(text) ? "partial" : "unknown";
    record.findings.push(...archiveFindings(version.snapshot, text));
    record.publishedChanges = version.changes?.length ?? null;
    if (version.previous && version.changes?.length) {
      record.previousSourceUrl = `${apiUrl}/api/public/pages/${encodeURIComponent(page.id)}/runs/${encodeURIComponent(version.previous.runId)}/source`;
      const beforeText = await load("previous-source.txt", async () =>
        (await readResponse(record.previousSourceUrl)).text(),
      );
      await save("previous-source.txt", beforeText);
      record.previousStates = [...beforeText.matchAll(/^## state: (.+)$/gm)].map(
        (match) => match[1],
      );
      const rejected = rejectedChanges(version.changes, beforeText, text);
      if (rejected.length)
        record.findings.push({
          rule: "changes_fail_stricter_evidence_check",
          severity: "review",
          changes: rejected,
        });
    }
  } catch (error) {
    record.findings.push({
      rule: "archive_check_failed",
      severity: "unknown",
      error: error.message,
    });
  }
  return record;
}

async function main() {
  const { values } = parseArgs({
    options: {
      archives: { type: "boolean", default: false },
      offline: { type: "boolean", default: false },
      output: { type: "string", default: "/private/tmp/pricelog-pricing-audit/report.json" },
      "api-url": { type: "string", default: "https://api.usepricelog.com" },
    },
  });
  const apiUrl = values["api-url"].replace(/\/$/, "");
  const output = resolve(values.output);
  const evidenceDir = resolve(dirname(output), "evidence");
  await mkdir(evidenceDir, { recursive: true });
  const rpc = async (path, input) =>
    (await (await readResponse(`${apiUrl}/rpc/${path}`, input)).json()).json;
  const startedAt = new Date().toISOString();
  const directory = values.offline
    ? JSON.parse(await readFile(resolve(evidenceDir, "directory.json"), "utf8"))
    : await readDirectory(rpc);
  await writeFile(resolve(evidenceDir, "directory.json"), JSON.stringify(directory, null, 2));
  const pages = Array.from({ length: directory.length });
  let next = 0;
  let finished = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < directory.length) {
        const index = next++;
        pages[index] = await auditPage(directory[index], {
          rpc,
          apiUrl,
          archives: values.archives,
          evidenceDir,
          offline: values.offline,
        });
        finished++;
        if (finished % 10 === 0 || finished === directory.length)
          process.stderr.write(
            `Checked ${finished}/${directory.length} snapshots${values.archives ? " and archives" : ""}\n`,
          );
      }
    }),
  );
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    apiUrl,
    archivesChecked: values.archives,
    offline: values.offline,
    scope:
      "Latest public snapshots; previous archives only where the latest version publishes changes. No scans or production writes.",
    summary: summarize(pages),
    pages,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ output, evidenceDir, ...report.summary }, null, 2) + "\n");
  if (pages.some((page) => page.findings.some((finding) => finding.severity === "unknown")))
    process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
