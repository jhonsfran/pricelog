import { createDb } from "@my-better-t-app/db";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { publishOwnerProjection } from "./publication";
import { MAX_EVALUATION_SOURCE_BYTES } from "./evaluation-request";
import {
  addAccessiblePriceLabels,
  trimCookieConsentMarkdown,
  trimPricingMarkdown,
} from "./source-cleanup";
import { PRICING_PIPELINE_ID, unavailableSnapshot } from "@my-better-t-app/db/pricing-snapshot";
import { numericPricesFromSnapshot } from "./snapshot-projection";
import {
  CAPTURE_STATE_SCRIPT,
  capturedInterstitial,
  captureRegion,
  readCapturedState,
  regionSnapshotOptions,
  STATE_READY_SELECTOR,
  structuredPriceData,
} from "./capture-state";
import {
  missedPrices,
  decideSnapshot,
  extractionRequest,
  type ExtractionModel,
  EXTRACTION_PARTS,
  factQuestions,
  groundExtraction,
  isFactKey,
  parseExtraction,
  readExtraction,
} from "./quote-snapshot";
import { buildPublicEvaluation } from "./evaluation";
import { jevDecisions } from "./jev-decisions";
import type { PageStore } from "./page-store";
import type { ArtifactManifest, JevAnswer, ScanWorkflowParams } from "./types";
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
  result: { content?: string; screenshot?: string; markdown?: string; accessibilityTree?: unknown };
  meta: { status?: number; title: string; finalUrl?: string };
};

type JevBinding = {
  run(
    model: "typesafe/jev",
    input: { state: string; questions: Record<string, unknown> },
    options: ReturnType<typeof jevGatewayOptions>,
  ): Promise<unknown>;
};

type ExtractionAiBinding = {
  run(model: ExtractionModel, input: ReturnType<typeof extractionRequest>): Promise<unknown>;
};

export interface ScanWorkflowEnv {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  BROWSER: BrowserRun;
  AI: Ai;
  PAGE_STORE: DurableObjectNamespace<PageStore>;
  PRICING_CAPTURE_CURRENCY?: string;
  PRICING_CAPTURE_LANGUAGE?: string;
}

const RETRY = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
};
// Each capture attempt pays for browser time, so a failing page gets three attempts in total.
const CAPTURE_RETRY = { retries: { ...RETRY.retries, limit: 2 } };

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

      const capture = await step.do("capture and archive", CAPTURE_RETRY, async () => {
        await store.setStage(params.runId, "capture");
        const region = regionSnapshotOptions(captureRegion(this.env));
        const snapshotOptions = {
          url: params.canonicalUrl,
          formats: ["content", "markdown", "screenshot", "accessibilityTree"],
          addScriptTag: [
            region.regionScript,
            { content: CONSENT_DISMISS_SCRIPT },
            { content: CAPTURE_STATE_SCRIPT },
          ],
          setExtraHTTPHeaders: region.setExtraHTTPHeaders,
          rejectRequestPattern: region.rejectRequestPattern,
          screenshotOptions: { fullPage: true, type: "png" },
          gotoOptions: { waitUntil: "networkidle2", timeout: 60_000 },
        } satisfies BrowserRunSnapshotOptions;
        // The state script signals once consent, scrolling and every UI state are recorded, so
        // short pages are captured sooner than a fixed wait allows.
        let browserMs = 0;
        const attempt = async (options: Record<string, unknown>) => {
          const response = await this.env.BROWSER.quickAction("snapshot", {
            ...snapshotOptions,
            ...options,
          });
          browserMs += Number(response.headers.get("X-Browser-Ms-Used")) || 0;
          return { ok: response.ok, status: response.status, body: await response.text() };
        };
        let result = await attempt({
          waitForSelector: { selector: STATE_READY_SELECTOR, timeout: 30_000 },
        });
        const interstitial =
          result.ok &&
          capturedInterstitial((JSON.parse(result.body) as SnapshotResult).result.content ?? "");
        // A page that navigates away or blocks the script never signals, and a bot check
        // redirects after the script ran; capture those after a fixed wait instead.
        if (interstitial || (!result.ok && /selector|time(?:d )?out/i.test(result.body))) {
          if (interstitial)
            await store.recordEvent(params.runId, {
              stage: "capture",
              kind: "warning",
              message: "The page showed a bot check first; capturing again after it resolves",
            });
          result = await attempt({ waitForTimeout: interstitial ? 8_000 : 5_000 });
        }
        if (!result.ok)
          throw new Error(`Browser Run failed with ${result.status}: ${result.body.slice(0, 300)}`);
        const snapshot = JSON.parse(result.body) as SnapshotResult;
        const html = snapshot.result.content;
        const rawMarkdown = snapshot.result.markdown;
        const screenshot = snapshot.result.screenshot;
        if (!html || !rawMarkdown || !screenshot)
          throw new Error("Browser Run returned an incomplete snapshot");
        const cleanedMarkdown = trimCookieConsentMarkdown(rawMarkdown);
        const enrichedMarkdown = addAccessiblePriceLabels(
          cleanedMarkdown,
          snapshot.result.accessibilityTree,
        );
        const markdown = enrichedMarkdown;
        const captured = readCapturedState(html);
        const pageText = captured?.text ?? markdown;

        const httpStatus = assertUsableCapture({
          httpStatus: snapshot.meta.status,
          title: snapshot.meta.title,
          html,
          markdown: pageText,
        });
        const structured = structuredPriceData(html);
        const content = structured ? `${pageText}\n\n${structured}` : pageText;

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
          sha256(content),
        ]);
        // Keep the large capture in this step; only the small manifest enters Workflow state.
        await store.setStage(params.runId, "archive");
        await Promise.all([
          this.env.ARTIFACTS.put(keys.htmlKey, html, {
            httpMetadata: { contentType: "text/html" },
          }),
          this.env.ARTIFACTS.put(keys.screenshotKey, screenshotBytes, {
            httpMetadata: { contentType: "image/png" },
          }),
          this.env.ARTIFACTS.put(keys.contentKey, content, {
            httpMetadata: { contentType: "text/markdown" },
          }),
        ]);
        return {
          description: extractPageDescription(html),
          state: captured ? { billingView: captured.billingView, states: captured.states } : null,
          browserMs: browserMs || null,
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
            contentBytes: new TextEncoder().encode(content).byteLength,
          } satisfies ArtifactManifest,
        };
      });

      await step.do("store capture version", RETRY, async () => {
        await store.persistVersion(params.runId, capture.manifest);
        if (!capture.state)
          await store.recordEvent(params.runId, {
            stage: "archive",
            kind: "warning",
            message: "The page state script did not finish; archived the cleaned Markdown instead",
          });
        await store.recordEvent(params.runId, {
          stage: "archive",
          kind: "completed",
          message: `Archived HTML (${capture.manifest.htmlBytes} B), ${capture.state ? `page state with ${capture.state.states} UI states` : "Markdown"} (${capture.manifest.contentBytes} B), and screenshot (${capture.manifest.screenshotBytes} B); browser time ${capture.browserMs ?? "unknown"} ms`,
          httpStatus: capture.manifest.httpStatus,
          outputBytes:
            capture.manifest.htmlBytes +
            capture.manifest.contentBytes +
            capture.manifest.screenshotBytes,
        });
      });

      const reused = await step.do("find unchanged evaluation", RETRY, async () => {
        const rubric = await store.getActiveRubric();
        const found = await store.findReusableEvaluation(
          params.runId,
          capture.manifest.contentSha256,
          rubric.id,
          PRICING_PIPELINE_ID,
        );
        if (!found) return null;
        const { runId, rubricId, model, evaluation, answers } = found;
        return { runId, rubricId, model, evaluation, answers };
      });

      const evaluateCapture = async () => {
        await step.do("enter draft stage", RETRY, async () => {
          await store.setStage(params.runId, "draft");
        });

        // The archived state is already free of navigation; only the Markdown fallback needs trimming.
        const readSource = async () => {
          const artifact = await this.env.ARTIFACTS.get(capture.manifest.contentKey);
          if (!artifact) throw new Error("Archived page content is missing");
          const content = await artifact.text();
          return capture.state ? content : trimPricingMarkdown(content);
        };

        const extracted = await step
          .do("extract quotes", RETRY, async () => {
            const source = await readSource();
            const ai = this.env.AI as unknown as ExtractionAiBinding;
            const settled = await Promise.allSettled(
              EXTRACTION_PARTS.map(async (part) => {
                let failure: unknown;
                for (const model of part.models) {
                  try {
                    const response = await ai.run(model, extractionRequest(model, part, source));
                    const value = parseExtraction(response);
                    if (missedPrices(part.name, value, source))
                      throw new Error("returned no prices for a page that shows amounts");
                    return { value, usage: readUsage(response), model };
                  } catch (error) {
                    failure = error;
                    await store.recordEvent(params.runId, {
                      stage: "draft",
                      kind: "warning",
                      message: `${model} failed on ${part.name}: ${String(error).slice(0, 160)}`,
                    });
                  }
                }
                throw failure;
              }),
            );
            const [pricesResult, featuresResult] = settled as [
              (typeof settled)[number],
              (typeof settled)[number],
            ];
            // Prices are the point of a scan, so only their failure retries the step.
            if (pricesResult.status === "rejected") throw pricesResult.reason;
            const prices = pricesResult.value;
            if (featuresResult.status === "rejected")
              await store.recordEvent(params.runId, {
                stage: "draft",
                kind: "warning",
                message: `The features extraction failed; publishing without features: ${String(featuresResult.reason).slice(0, 200)}`,
              });
            const features =
              featuresResult.status === "fulfilled"
                ? featuresResult.value
                : { value: { features: [] }, usage: { input: 0, output: 0 }, model: null };
            const extraction = readExtraction(prices.value, features.value);
            await store.recordEvent(params.runId, {
              stage: "draft",
              kind: "completed",
              message: `${[...new Set([prices.model, features.model].filter(Boolean))].join(" + ")} quoted ${extraction.prices.length} prices and ${extraction.features.length} feature rows (${prices.usage.input + features.usage.input} input and ${prices.usage.output + features.usage.output} output tokens)`,
              inputBytes: new TextEncoder().encode(source).byteLength,
            });
            return {
              raw: JSON.stringify({ prices: prices.value, features: features.value }),
              extraction,
              reason: null,
            };
          })
          .catch(async (error: unknown) => {
            const message = error instanceof Error ? error.message : "Unknown extraction error";
            await store.recordEvent(params.runId, {
              stage: "draft",
              kind: "warning",
              message: `Quote extraction failed: ${message.slice(0, 200)}`,
            });
            return { raw: "", extraction: null, reason: `Quote extraction failed: ${message}` };
          });

        const verified = await step.do("verify quotes", RETRY, async () => {
          await store.setStage(params.runId, "verify");
          const rubric = await store.getActiveRubric();
          const source = await readSource();
          const unavailable = (reason: string) => ({
            rubricId: rubric.id,
            model: null,
            answers: [] as JevAnswer[],
            grounded: null,
            reason,
          });
          if (!extracted.extraction) return unavailable(extracted.reason ?? "Extraction failed");
          if (new TextEncoder().encode(source).byteLength > MAX_EVALUATION_SOURCE_BYTES)
            return unavailable("Captured page exceeds the Jev source limit");
          const grounded = groundExtraction(source, extracted.extraction);
          const decisions = jevDecisions((input) =>
            (this.env.AI as unknown as JevBinding).run("typesafe/jev", input, jevGatewayOptions()),
          );
          const answers = await decisions.run(source, [
            ...rubric.questions,
            ...factQuestions(grounded),
          ]);
          if (!decisions.model) throw new Error("Jev returned no model version");
          return { rubricId: rubric.id, model: decisions.model, answers, grounded, reason: null };
        });

        await step.do("record verification summary", RETRY, async () => {
          await store.recordEvent(params.runId, {
            stage: "verify",
            kind: verified.model ? "completed" : "warning",
            message:
              verified.model && verified.grounded
                ? `Grounded ${verified.grounded.prices.length} prices and ${verified.grounded.features.length} feature rows (${verified.grounded.review.length} quotes not found on the page or invalid); Jev ${verified.model} answered ${verified.answers.length} questions`
                : `Jev skipped: ${verified.reason}`,
          });
        });

        const evaluation = await step.do("project verified snapshot", RETRY, async () => {
          await store.setStage(params.runId, "project");
          if (verified.model && verified.grounded) {
            const decision = decideSnapshot({
              stateText: await readSource(),
              billingView: capture.state?.billingView ?? "unknown",
              grounded: verified.grounded,
              answers: verified.answers.filter((answer) => isFactKey(answer.key)),
              requestedCurrency: captureRegion(this.env).currency,
            });
            return {
              rubricId: verified.rubricId,
              model: verified.model,
              draft: extracted.raw,
              ...buildPublicEvaluation(
                verified.answers.filter((answer) => !isFactKey(answer.key)),
                decision.snapshot,
              ),
              snapshot: decision.snapshot,
              numericPrices: numericPricesFromSnapshot(decision.snapshot, verified.model),
              review: decision.review,
              coverage: decision.coverage,
              pipeline: PRICING_PIPELINE_ID,
            };
          }
          const reason = verified.reason ?? "Pricing verification was unavailable";
          return {
            rubricId: verified.rubricId,
            model: "unavailable",
            draft: extracted.raw,
            choices: [],
            signals: [],
            tags: [],
            snapshot: unavailableSnapshot(reason),
            review: [{ path: "draft", value: reason, reason: "unavailable" as const }],
            coverage: null,
            pipeline: PRICING_PIPELINE_ID,
          };
        });

        return { evaluation, answers: verified.answers };
      };

      // The same content, rubric and pipeline give the same facts, so an unchanged page costs no model calls.
      const { evaluation, answers } = reused
        ? await step.do("reuse unchanged evaluation", RETRY, async () => {
            await store.recordEvent(params.runId, {
              stage: "project",
              kind: "completed",
              message: `Content unchanged since run ${reused.runId}; reused its evaluation (no model calls)`,
            });
            return {
              evaluation: { rubricId: reused.rubricId, model: reused.model, ...reused.evaluation },
              answers: reused.answers,
            };
          })
        : await evaluateCapture();

      await step.do("record projection summary", RETRY, async () => {
        const prices = evaluation.snapshot.offers.reduce(
          (count, offer) => count + offer.prices.length,
          0,
        );
        const coverage = evaluation.coverage
          ? `; quotes cover ${evaluation.coverage.claimed} of ${evaluation.coverage.literals} price literals`
          : "";
        await store.recordEvent(params.runId, {
          stage: "project",
          kind: evaluation.snapshot.status === "collected" ? "completed" : "warning",
          message: `Published ${evaluation.snapshot.offers.length} offers, ${prices} prices, and ${evaluation.snapshot.features.length} features; ${evaluation.review.length} review items${coverage}`,
        });
      });

      await step.do("store evaluation", RETRY, async () => {
        await store.setStage(params.runId, "store");
        if (answers.length) await store.persistAnswers(params.runId, evaluation.rubricId, answers);
        await store.persistEvaluation(params.runId, evaluation);
      });

      await step.do("prepare publication", RETRY, async () => {
        await store.setStage(params.runId, "publish");
        await store.preparePublication(params.runId, {
          pageId: params.pageId,
          runId: params.runId,
          normalizedDomain: params.normalizedDomain,
          capturedAt: capture.manifest.capturedAt,
          displayName: capture.manifest.title ?? params.normalizedDomain,
          description: capture.description,
          ...evaluation,
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

function readUsage(response: unknown): { input: number; output: number } {
  const usage =
    response && typeof response === "object"
      ? ((
          response as {
            usage?: Record<string, unknown>;
            result?: { usage?: Record<string, unknown> };
          }
        ).usage ?? (response as { result?: { usage?: Record<string, unknown> } }).result?.usage)
      : undefined;
  return {
    input: Number(usage?.prompt_tokens) || 0,
    output: Number(usage?.completion_tokens) || 0,
  };
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
