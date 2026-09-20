import { createDb } from "@my-better-t-app/db";
import { page, pageOwnerState, pagePublicSummary } from "@my-better-t-app/db/schema/pages";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";

import { buildPublicEvaluation } from "./evaluation";
import { budgetMarkdown } from "./score";
import type { PageStore } from "./page-store";
import type { ArtifactManifest, PersistedQuestion, ScanWorkflowParams } from "./types";
import { normalizePricingUrl } from "./url";
import {
  artifactKeys,
  assertUsableCapture,
  CONSENT_DISMISS_SCRIPT,
  extractPageDescription,
  jevGatewayOptions,
  parseJevAnswers,
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
        await db
          .insert(pageOwnerState)
          .values({
            pageId: params.pageId,
            activeRunId: params.runId,
            lastRunId: params.runId,
            lastRunStatus: "running",
          })
          .onConflictDoUpdate({
            target: pageOwnerState.pageId,
            set: {
              activeRunId: params.runId,
              lastRunId: params.runId,
              lastRunStatus: "running",
              updatedAt: new Date(),
            },
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
        const markdown = budgetMarkdown(await artifact.text());
        const questions = Object.fromEntries(
          rubric.questions.map((item: PersistedQuestion) => [
            item.key,
            { type: item.type, instructions: item.instructions, criteria: item.criteria },
          ]),
        );
        const response = await (this.env.AI as unknown as JevBinding).run(
          "typesafe/jev",
          { state: markdown, questions },
          jevGatewayOptions(),
        );
        const answers = parseJevAnswers(response, rubric.questions);
        await store.persistAnswers(params.runId, rubric.id, answers);
        const publicEvaluation = buildPublicEvaluation(answers);
        return {
          rubricId: rubric.id,
          model: rubric.model,
          ...publicEvaluation,
        };
      });

      await step.do("publish projection", RETRY, async () => {
        await store.setStage(params.runId, "publish");
        const scannedAt = new Date(capture.manifest.capturedAt);
        await db
          .insert(pagePublicSummary)
          .values({
            pageId: params.pageId,
            runId: params.runId,
            rubricId: evaluation.rubricId,
            model: evaluation.model,
            overallScore: evaluation.overallScore,
            scores: evaluation.scores,
            choices: evaluation.choices,
            signals: evaluation.signals,
            tags: evaluation.tags,
            browserEngine: "chromium",
            scannedAt,
          })
          .onConflictDoUpdate({
            target: pagePublicSummary.pageId,
            set: {
              runId: params.runId,
              rubricId: evaluation.rubricId,
              model: evaluation.model,
              overallScore: evaluation.overallScore,
              scores: evaluation.scores,
              choices: evaluation.choices,
              signals: evaluation.signals,
              tags: evaluation.tags,
              browserEngine: "chromium",
              scannedAt,
              updatedAt: new Date(),
            },
            setWhere: sql`${pagePublicSummary.scannedAt} < excluded.scanned_at`,
          });
        await db
          .update(page)
          .set({
            state: "active",
            displayName: capture.manifest.title ?? params.normalizedDomain,
            description: capture.description,
          })
          .where(eq(page.id, params.pageId));
      });

      const nextScanAt = await step.do("complete scan", async () => {
        return store.completeSuccess(params.runId);
      });
      await step.do("publish successful owner state", RETRY, async () => {
        await db
          .insert(pageOwnerState)
          .values({
            pageId: params.pageId,
            activeRunId: null,
            lastRunId: params.runId,
            lastRunStatus: "succeeded",
            nextScanAt: new Date(nextScanAt),
          })
          .onConflictDoUpdate({
            target: pageOwnerState.pageId,
            set: {
              activeRunId: null,
              lastRunId: params.runId,
              lastRunStatus: "succeeded",
              nextScanAt: new Date(nextScanAt),
              updatedAt: new Date(),
            },
          });
      });
    } catch (error) {
      await step.do("record terminal failure", async () => {
        const run = await store.getRun(params.runId);
        if (run?.status === "succeeded") return;
        const message = error instanceof Error ? error.message : "Scan failed";
        const nextScanAt = await store.completeFailure(params.runId, "scan_failed", message);
        await db
          .insert(pageOwnerState)
          .values({
            pageId: params.pageId,
            activeRunId: null,
            lastRunId: params.runId,
            lastRunStatus: "failed",
            nextScanAt: new Date(nextScanAt),
          })
          .onConflictDoUpdate({
            target: pageOwnerState.pageId,
            set: {
              activeRunId: null,
              lastRunId: params.runId,
              lastRunStatus: "failed",
              nextScanAt: new Date(nextScanAt),
              updatedAt: new Date(),
            },
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
