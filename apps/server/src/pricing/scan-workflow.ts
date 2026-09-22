import { createDb } from "@my-better-t-app/db";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { publishOwnerProjection } from "./publication";
import { buildPublicEvaluation } from "./evaluation";
import { evaluatePricing } from "./evaluation-request";
import { collectNumericPrices } from "./numeric-prices";
import type { NumericPrices } from "@my-better-t-app/db/numeric-prices";
import type { PageStore } from "./page-store";
import type { ArtifactManifest, ScanWorkflowParams } from "./types";
import { normalizePricingUrl } from "./url";
import {
  artifactKeys,
  assertUsableCapture,
  CONSENT_DISMISS_SCRIPT,
  extractPageDescription,
  jevGatewayOptions,
} from "./scan-workflow-logic";
import { resolveDnsAddresses } from "./url";

type SnapshotResult = {
  success: true;
  result: { content?: string; screenshot?: string; markdown?: string };
  meta: { status?: number; title: string; finalUrl?: string };
};

type JevBinding = {
  run(
    model: "typesafe/jev",
    input: { state: string; questions: Record<string, unknown> },
    options: ReturnType<typeof jevGatewayOptions>,
  ): Promise<unknown>;
};

export interface ScanWorkflowEnv {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  BROWSER: BrowserRun;
  AI: Ai;
  PAGE_STORE: DurableObjectNamespace<PageStore>;
}

const RETRY = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
};

export class ScanWorkflow extends WorkflowEntrypoint<ScanWorkflowEnv, ScanWorkflowParams> {
  async run(event: Readonly<WorkflowEvent<ScanWorkflowParams>>, step: WorkflowStep): Promise<void> {
    const params = event.payload;
    const store = this.env.PAGE_STORE.getByName(params.normalizedDomain);
    const db = createDb({ DB: this.env.DB });

    try {
      await step.do("mark running", async () => {
        await store.markRunning(params.runId, "capture");
        const run = await store.getRun(params.runId);
        if (!run) throw new Error("Scan run is missing");
        await publishOwnerProjection(db, {
          pageId: params.pageId,
          runId: params.runId,
          runCreatedAt: run.createdAt,
          status: "running",
        });
      });

      const capture = await step.do("capture and archive", RETRY, async () => {
        const response = await this.env.BROWSER.quickAction("snapshot", {
          url: params.canonicalUrl,
          formats: ["content", "markdown", "screenshot"],
          addScriptTag: [{ content: CONSENT_DISMISS_SCRIPT }],
          screenshotOptions: { fullPage: true, type: "png" },
          gotoOptions: { waitUntil: "networkidle2", timeout: 60_000 },
          waitForTimeout: 3_000,
        });
        if (!response.ok) throw new Error(`Browser Run failed with ${response.status}`);
        const snapshot = (await response.json()) as SnapshotResult;
        const html = snapshot.result.content;
        const markdown = snapshot.result.markdown;
        const screenshot = snapshot.result.screenshot;
        if (!html || !markdown || !screenshot)
          throw new Error("Browser Run returned an incomplete snapshot");

        const httpStatus = assertUsableCapture({
          httpStatus: snapshot.meta.status,
          title: snapshot.meta.title,
          html,
          markdown,
        });

        const finalUrl = snapshot.meta.finalUrl ?? params.canonicalUrl;
        const normalized = await normalizePricingUrl(finalUrl, resolveDnsAddresses);
        if (normalized.normalizedDomain !== params.normalizedDomain) {
          throw new Error("Browser redirect left the claimed domain");
        }

        const screenshotBytes = decodeBase64(screenshot);
        const keys = artifactKeys(params.normalizedDomain, params.runId);
        const [htmlSha256, screenshotSha256, contentSha256] = await Promise.all([
          sha256(html),
          sha256(screenshotBytes),
          sha256(markdown),
        ]);
        await Promise.all([
          this.env.ARTIFACTS.put(keys.htmlKey, html, {
            httpMetadata: { contentType: "text/html" },
          }),
          this.env.ARTIFACTS.put(keys.screenshotKey, screenshotBytes, {
            httpMetadata: { contentType: "image/png" },
          }),
          this.env.ARTIFACTS.put(keys.contentKey, markdown, {
            httpMetadata: { contentType: "text/markdown" },
          }),
        ]);
        return {
          description: extractPageDescription(html),
          manifest: {
            capturedAt: Date.now(),
            httpStatus,
            finalUrl: normalized.canonicalUrl,
            title: snapshot.meta.title || null,
            ...keys,
            htmlSha256,
            screenshotSha256,
            contentSha256,
            htmlBytes: new TextEncoder().encode(html).byteLength,
            screenshotBytes: screenshotBytes.byteLength,
            contentBytes: new TextEncoder().encode(markdown).byteLength,
          } satisfies ArtifactManifest,
        };
      });

      await step.do("persist version", RETRY, async () => {
        await store.setStage(params.runId, "persist");
        await store.persistVersion(params.runId, capture.manifest);
      });

      const evaluation = await step.do("evaluate pricing", RETRY, async () => {
        await store.setStage(params.runId, "evaluate");
        const rubric = await store.getActiveRubric();
        const artifact = await this.env.ARTIFACTS.get(capture.manifest.contentKey);
        if (!artifact) throw new Error("Archived Markdown is missing");
        const markdown = await artifact.text();
        const { model, answers } = await evaluatePricing(markdown, rubric.questions, (input) =>
          (this.env.AI as unknown as JevBinding).run("typesafe/jev", input, jevGatewayOptions()),
        );
        await store.persistAnswers(params.runId, rubric.id, answers);
        const publicEvaluation = buildPublicEvaluation(answers);
        return {
          rubricId: rubric.id,
          model,
          ...publicEvaluation,
        };
      });

      let numericPrices: NumericPrices;
      try {
        numericPrices = await step.do("collect numeric prices", RETRY, async () => {
          const artifact = await this.env.ARTIFACTS.get(capture.manifest.contentKey);
          if (!artifact) throw new Error("Archived Markdown is missing");
          return collectNumericPrices(await artifact.text(), (input) =>
            (this.env.AI as unknown as JevBinding).run("typesafe/jev", input, jevGatewayOptions()),
          );
        });
      } catch {
        numericPrices = {
          version: "numeric-prices-v1",
          status: "unavailable",
          model: null,
          offers: [],
          reason: "Numeric evaluation could not be completed for this capture.",
        };
      }
      const completeEvaluation = { ...evaluation, numericPrices };
      await step.do("persist complete evaluation", RETRY, async () => {
        await store.persistEvaluation(params.runId, completeEvaluation);
      });

      await step.do("prepare publication", RETRY, async () => {
        await store.preparePublication(params.runId, {
          pageId: params.pageId,
          runId: params.runId,
          normalizedDomain: params.normalizedDomain,
          capturedAt: capture.manifest.capturedAt,
          displayName: capture.manifest.title ?? params.normalizedDomain,
          description: capture.description,
          ...completeEvaluation,
        });
      });

      // The DO freezes the version and retains publication until D1 acknowledges it.
      await step.do("complete scan", RETRY, async () => {
        await store.completeSuccess(params.runId);
      });

      await step.do("publish projection", RETRY, async () => {
        await store.publishPending();
      });
    } catch (error) {
      await step.do("record terminal failure", async () => {
        const run = await store.getRun(params.runId);
        if (run?.status === "succeeded") return;
        const message = error instanceof Error ? error.message : "Scan failed";
        const nextScanAt = await store.completeFailure(params.runId, "scan_failed", message);
        if (!run) throw new Error("Scan run is missing");
        await publishOwnerProjection(db, {
          pageId: params.pageId,
          runId: params.runId,
          runCreatedAt: run.createdAt,
          status: "failed",
          nextScanAt,
        });
      });
      throw error;
    }
  }
}

function decodeBase64(value: string): Uint8Array {
  const raw = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  return Uint8Array.from(atob(raw), (character) => character.charCodeAt(0));
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
