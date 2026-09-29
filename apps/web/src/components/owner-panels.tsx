import type { PageMonitorRun } from "@pricelog/api/context";
import { JEV_CHOICE_KEYS, getPricingChoiceLabel } from "@pricelog/api/pricing-intelligence";
import type { PublishedSnapshot, SnapshotReview } from "@pricelog/api/pricing-snapshot";
import { SCAN_PIPELINE_STAGES, SCAN_STAGE_DETAILS } from "@pricelog/api/scan-stage";
import { buttonVariants } from "@pricelog/ui/components/button";
import { cn } from "@pricelog/ui/lib/utils";
import { Download, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { formatToken } from "@/lib/format";
import { formatStamp } from "@/lib/time";
import { serverUrl } from "@/lib/url";
import { LayerDepth } from "./layer-depth";
import { RelativeTime } from "./relative-time";
import { RunStatus } from "./run-status";

/** A card only the page's owner sees, labelled so nobody mistakes it for the public record. */
function OwnerCard({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-gray-5", className)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-gray-5 px-5 py-3">
        <h2 className="text-sm tracking-normal">{title}</h2>
        <span className="kicker text-muted-foreground">{meta ?? "Only you see this"}</span>
      </header>
      {children}
    </section>
  );
}

type Choice = { key: string; choice: string; confidence: number };

/** How the capture was read: when, by which rubric and model, and how sure each answer was. */
export function CollectionDetails({
  summary,
}: {
  summary: {
    runId: string;
    scannedAt: Date | string;
    rubricId: string;
    model: string;
    browserEngine: string;
    snapshot: PublishedSnapshot | null;
    choices: Choice[];
  };
}) {
  const rows: [string, ReactNode][] = [
    ["Captured", formatStamp(summary.scannedAt)],
    ["Run", <code key="run">{summary.runId.slice(0, 8)}</code>],
    ["Rubric", summary.rubricId],
    ["Model", summary.model],
    ["Browser", formatToken(summary.browserEngine)],
  ];
  if (summary.snapshot) rows.push(["Snapshot", summary.snapshot.version]);
  const answers = JEV_CHOICE_KEYS.map((key) => ({
    key,
    answer: summary.choices.find((choice) => choice.key === key),
  }));
  return (
    <OwnerCard title="Collection details">
      <dl className="grid px-5 py-2 text-sm">
        {rows.map(([term, detail]) => (
          <div
            key={term}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 border-b border-gray-4 py-2 last:border-b-0"
          >
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="font-mono text-xs leading-5 wrap-anywhere text-gray-11">{detail}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-gray-5 px-5 py-3">
        <p className="kicker text-muted-foreground">Classification confidence</p>
        <ul className="mt-2.5 grid gap-2">
          {answers.map(({ key, answer }) => (
            <li
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_4rem_2.5rem] items-center gap-3 text-xs"
            >
              <span className="min-w-0 truncate text-gray-11">
                {getPricingChoiceLabel(key)}
                {answer ? (
                  <span className="text-muted-foreground"> · {formatToken(answer.choice)}</span>
                ) : null}
              </span>
              <span className="block h-1 bg-gray-4" aria-hidden="true">
                <span
                  className="block h-full bg-gray-10"
                  style={{ width: `${Math.round((answer?.confidence ?? 0) * 100)}%` }}
                />
              </span>
              <span className="text-right font-mono text-muted-foreground tabular-nums">
                {answer ? `${Math.round(answer.confidence * 100)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          A missing answer did not reach its threshold or the page does not state it.
        </p>
      </div>
    </OwnerCard>
  );
}

/** Every quote or claim that did not publish, and why it stopped. */
export function ReviewClaims({ review }: { review: SnapshotReview[] | null | undefined }) {
  if (!review?.length) return null;
  return (
    <OwnerCard
      title="Claims held back"
      meta={`${review.length} · Only you see this`}
      className="mt-10"
    >
      <p className="px-5 pt-3 text-sm text-muted-foreground">
        Quotes and claims from this capture that did not publish. They stay out of the public record
        and every comparison.
      </p>
      <div className="overflow-x-auto px-5 pt-2 pb-3">
        <table className="w-full min-w-150 text-left text-sm">
          <thead>
            <tr className="kicker text-muted-foreground">
              <th scope="col" className="h-9 pr-4 font-normal">
                Field
              </th>
              <th scope="col" className="h-9 pr-4 font-normal">
                Why it stopped
              </th>
              <th scope="col" className="h-9 font-normal">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {review.map((item, index) => (
              <tr key={`${item.path}:${index}`} className="border-t border-gray-4 align-top">
                <th scope="row" className="py-2.5 pr-4 font-mono text-xs font-normal text-gray-11">
                  {item.path}
                </th>
                <td className="py-2.5 pr-4">
                  <span className="kicker border border-warning-6 px-1 text-warning-11">
                    {formatToken(item.reason)}
                  </span>
                </td>
                <td className="py-2.5 font-mono text-xs text-muted-foreground wrap-anywhere">
                  {typeof item.value === "string" ? item.value : JSON.stringify(item.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OwnerCard>
  );
}

const PIPELINE = SCAN_PIPELINE_STAGES.filter((stage) => stage !== "complete");

/** A scan in flight, as the pipeline it walks: finished steps lit, the current one pulsing. */
export function ScanProgress({ run }: { run: PageMonitorRun }) {
  const at = PIPELINE.findIndex((stage) => stage === run.stage);
  return (
    <section
      aria-label="Scan in progress"
      className="mt-6 border border-signal-6 bg-signal-2 px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="flex items-center gap-3">
          <RunStatus status={run.status} />
          <span className="text-sm text-signal-12">{SCAN_STAGE_DETAILS[run.stage].label}</span>
        </p>
        <span className="kicker text-signal-11">
          Started <RelativeTime value={run.startedAt ?? run.createdAt} />
        </span>
      </div>
      <ol className="mt-4 grid grid-cols-8 gap-1" aria-label="Pipeline stages">
        {PIPELINE.map((stage, index) => (
          <li key={stage} title={SCAN_STAGE_DETAILS[stage].label}>
            <span
              className={cn(
                "block h-1",
                index < at
                  ? "bg-signal-9"
                  : index === at
                    ? "bg-signal-9 motion-safe:animate-pulse"
                    : "bg-signal-5",
              )}
            />
            <span className="sr-only">
              {SCAN_STAGE_DETAILS[stage].label}
              {index < at ? ", done" : index === at ? ", in progress" : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Every scan of the page, newest first. Only a successful scan becomes a layer, so failed
 * attempts stay in the history without taking a number no stored capture answers to.
 */
export function CaptureHistory({
  pageId,
  runs,
  more,
}: {
  pageId: string;
  runs: PageMonitorRun[];
  /** More runs exist than are loaded. */
  more?: boolean;
}) {
  let captured = 0;
  const stack = runs.map((run) => ({
    run,
    layer: run.status === "succeeded" ? ++captured : null,
  }));
  return (
    <section className="mt-14" aria-labelledby="history-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="history-title" className="text-2xl tracking-[-0.02em]">
            Capture history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every scan, with its screenshot, captured text and stage trace.
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          <LayerDepth count={captured} loaded={more} />
        </span>
      </div>
      <ol className="mt-5 border border-gray-5">
        {stack.map(({ run, layer }) => (
          <li
            key={run.id}
            className={cn(
              "grid grid-cols-[4rem_9rem_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-l-2 border-b-gray-4 px-4 py-3 last:border-b-0 max-md:grid-cols-[4rem_minmax(0,1fr)]",
              layer === 1 ? "border-l-signal-9" : "border-l-transparent",
            )}
          >
            <span className="kicker text-muted-foreground tabular-nums">
              <strong
                className={cn(
                  "block text-xs font-medium",
                  layer === 1 ? "text-signal-11" : "text-gray-11",
                )}
              >
                {layer ? (layer === 1 ? "Live" : String(layer).padStart(2, "0")) : "—"}
              </strong>
              {run.trigger}
            </span>
            <RunStatus status={run.status} />
            <span className="grid min-w-0 gap-0.5 max-md:col-span-full">
              <span className="text-sm" title={formatStamp(run.createdAt)}>
                <RelativeTime value={run.createdAt} />
              </span>
              <small className="truncate text-xs text-muted-foreground">
                {run.errorMessage ?? SCAN_STAGE_DETAILS[run.stage].label}
              </small>
            </span>
            {run.status === "succeeded" ? (
              <span className="flex flex-wrap gap-1.5 max-md:col-span-full">
                {/* The screenshot and text open in a new tab; captured HTML only downloads. */}
                {(["screenshot", "content", "html"] as const).map((kind) => {
                  const view = kind !== "html";
                  const Icon = view ? ExternalLink : Download;
                  return (
                    <a
                      key={kind}
                      href={serverUrl(`/api/pages/${pageId}/runs/${run.id}/artifacts/${kind}`)}
                      {...(view ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className={cn(buttonVariants({ variant: "outline", size: "xs" }), "kicker")}
                    >
                      <Icon data-icon="inline-start" aria-hidden="true" />
                      {kind === "content" ? "text" : kind}
                    </a>
                  );
                })}
              </span>
            ) : (
              <span className="max-md:hidden" />
            )}
            <details className="col-span-full text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer hover:text-foreground">
                Stage trace · {run.events.length} events
              </summary>
              {run.events.length ? (
                <ol className="mt-2.5 mb-1 space-y-1.5 border-l border-gray-6 pl-4">
                  {run.events.map((event, index) => (
                    <li key={`${event.at}-${index}`} className="flex flex-wrap gap-x-3 gap-y-1">
                      <time
                        className="font-mono tabular-nums"
                        dateTime={new Date(event.at).toISOString()}
                      >
                        {new Date(event.at).toLocaleTimeString()}
                      </time>
                      <span className="text-foreground">
                        {SCAN_STAGE_DETAILS[event.stage].label} · {event.kind}
                      </span>
                      {event.httpStatus ? <span>HTTP {event.httpStatus}</span> : null}
                      {event.inputBytes ? (
                        <span>input {event.inputBytes.toLocaleString()} B</span>
                      ) : null}
                      {event.outputBytes ? (
                        <span>output {event.outputBytes.toLocaleString()} B</span>
                      ) : null}
                      {event.message ? (
                        <span className="basis-full wrap-anywhere">{event.message}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2">No stage trace was recorded for this run.</p>
              )}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
