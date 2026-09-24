import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { Button } from "@my-better-t-app/ui/components/button";
import { cn } from "@my-better-t-app/ui/lib/utils";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Play } from "lucide-react";
import { toast } from "sonner";
import { IntelligenceProfile } from "@/components/intelligence-profile";
import { LayerDepth } from "@/components/layer-depth";
import { NumericPricesPanel } from "@/components/numeric-prices";
import { BackLink, PageHeader, PageShell, SectionHeading, StatePage } from "@/components/page";
import { PricingFactsPanel } from "@/components/pricing-facts";
import { RelativeTime } from "@/components/relative-time";
import { RunStatus } from "@/components/run-status";
import { displayUrl, serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/pages/$pageId")({
  component: OwnerPageDetail,
});

function OwnerPageDetail() {
  const { pageId } = Route.useParams();
  const detail = useInfiniteQuery(
    orpc.pages.getOwned.infiniteOptions({
      input: (cursor: DescendingTimestampCursor | null) => ({
        pageId,
        ...(cursor ? { cursor } : {}),
      }),
      initialPageParam: null as DescendingTimestampCursor | null,
      getNextPageParam: (lastPage) => lastPage.runs.nextCursor,
      refetchInterval: 5_000,
    }),
  );
  const trigger = useMutation(
    orpc.pages.triggerRun.mutationOptions({
      onSuccess: async (run) => {
        await detail.refetch();
        toast.success(
          run.status === "running" || run.status === "queued"
            ? "Scan is active."
            : "Scan requested.",
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  if (detail.isLoading) return <StatePage loading text="Loading owner record…" />;
  const pages = detail.data?.pages;
  if (!pages?.length) return <StatePage text="Page not found." />;
  const data = pages[0]!;
  const runs = pages.flatMap((result) => result.runs.items);
  const active = runs.find((run) => run.id === data.state?.activeRunId);
  // Only a successful scan becomes a layer, so failed attempts stay in the
  // history without taking a number that no stored capture answers to.
  let captured = 0;
  const stack = runs.map((run) => ({
    run,
    layer: run.status === "succeeded" ? ++captured : null,
  }));
  return (
    <PageShell>
      <BackLink to="/dashboard">Your pages</BackLink>
      <PageHeader
        eyebrow="Owner record"
        title={data.page.normalizedDomain}
        aside={
          <Button
            size="lg"
            className="w-fit md:justify-self-end"
            disabled={trigger.isPending}
            onClick={() => trigger.mutate({ pageId })}
          >
            <Play data-icon="inline-start" />
            {active ? "View active scan" : trigger.isPending ? "Starting…" : "Scan now"}
          </Button>
        }
      >
        <p className="mt-4 font-mono text-xs text-muted-foreground wrap-anywhere">
          {displayUrl(data.page.canonicalUrl)}
        </p>
      </PageHeader>
      {active ? (
        <div className="kicker mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border border-signal-6 bg-signal-2 px-4.5 py-4 text-signal-11">
          <RunStatus status={active.status} />
          <span>Capturing now · stage {active.stage}</span>
          <span>Run {active.id.slice(0, 8)}</span>
        </div>
      ) : null}
      {data.summary ? (
        <>
          <NumericPricesPanel
            prices={data.summary.numericPrices}
            sourceUrl={`/api/public/pages/${pageId}/runs/${data.summary.runId}/source`}
          />
          <PricingFactsPanel
            facts={data.summary.pricingFacts}
            sourceUrl={`/api/public/pages/${pageId}/runs/${data.summary.runId}/source`}
          />
          <IntelligenceProfile
            rubricId={data.summary.rubricId}
            choices={data.summary.choices}
            signals={data.summary.signals}
            tags={data.summary.tags}
          />
        </>
      ) : null}
      <section className="mt-14 border-t border-gray-7">
        <SectionHeading
          title="Capture stack"
          meta={
            <LayerDepth
              count={captured}
              noun={detail.hasNextPage ? "captures loaded" : "captures"}
            />
          }
        />
        {/* The rail is the stack seen edge-on: the live capture is lit,
            every older one sits behind it. */}
        <div className="mt-2 border-t border-gray-7">
          {stack.map(({ run, layer }) => (
            <article
              key={run.id}
              className={cn(
                "grid min-h-21 grid-cols-[6rem_9.5rem_minmax(0,1fr)_auto] items-center gap-5 border-b border-l-2 pl-4 max-md:grid-cols-[4.5rem_minmax(0,1fr)] max-md:gap-y-3 max-md:py-4.5",
                layer === 1 ? "border-l-signal-9" : "border-l-gray-7",
              )}
            >
              <span className="kicker flex flex-col gap-1 text-muted-foreground tabular-nums">
                <strong
                  className={cn(
                    "text-xs font-medium",
                    layer === 1 ? "text-foreground" : "text-gray-11",
                  )}
                >
                  {layer ? (layer === 1 ? "LIVE" : String(layer).padStart(2, "0")) : "—"}
                </strong>
                <span>{layer ? "Layer" : "No layer"}</span>
              </span>
              <div className="flex items-center gap-2.5">
                <RunStatus status={run.status} />
                <span className="kicker text-muted-foreground">{run.trigger}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <strong className="text-base font-medium">
                  <RelativeTime value={run.createdAt} />
                </strong>
                <small className="text-xs text-muted-foreground">
                  {run.errorMessage ?? `Stage: ${run.stage}`}
                </small>
              </div>
              {run.status === "succeeded" ? (
                <div className="flex flex-wrap gap-2">
                  {(["screenshot", "html", "content"] as const).map((kind) => (
                    <Button
                      key={kind}
                      render={<a href={artifactUrl(pageId, run.id, kind)} />}
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      className="kicker text-2xs"
                    >
                      <Download data-icon="inline-start" />
                      {kind}
                    </Button>
                  ))}
                </div>
              ) : (
                <span />
              )}
            </article>
          ))}
        </div>
        {detail.hasNextPage ? (
          <Button
            className="mx-auto mt-6 flex"
            variant="outline"
            disabled={detail.isFetchingNextPage}
            onClick={() => detail.fetchNextPage()}
          >
            {detail.isFetchingNextPage ? "Loading…" : "Load older runs"}
          </Button>
        ) : null}
      </section>
    </PageShell>
  );
}

function artifactUrl(pageId: string, runId: string, kind: string) {
  return serverUrl(`/api/pages/${pageId}/runs/${runId}/artifacts/${kind}`);
}
