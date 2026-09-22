import type { DescendingTimestampCursor } from "@my-better-t-app/api/pagination";
import { Button } from "@my-better-t-app/ui/components/button";
import { Spinner } from "@my-better-t-app/ui/components/spinner";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Play } from "lucide-react";
import { toast } from "sonner";
import { IntelligenceProfile } from "@/components/intelligence-profile";
import { LayerDepth } from "@/components/layer-depth";
import { LayerTitle } from "@/components/layer-title";
import { NumericPricesPanel } from "@/components/numeric-prices";
import { RelativeTime } from "@/components/relative-time";
import { RunStatus } from "@/components/run-status";
import { ENV } from "@/env.public";
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
  if (detail.isLoading) {
    return (
      <div className="state-page" role="status">
        <Spinner />
        Loading owner record…
      </div>
    );
  }
  const pages = detail.data?.pages;
  if (!pages?.length) return <div className="state-page">Page not found.</div>;
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
    <main className="dashboard-shell detail-shell">
      <Link className="back-link" to="/dashboard">
        <ArrowLeft size={15} />
        Your pages
      </Link>
      <section className="detail-heading">
        <div>
          <p className="eyebrow">Owner record</p>
          <h1>
            <LayerTitle>{data.page.displayName ?? data.page.normalizedDomain}</LayerTitle>
          </h1>
          <p>{data.page.canonicalUrl}</p>
        </div>
        <Button
          className="scan-button"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate({ pageId })}
        >
          <Play data-icon="inline-start" />
          {active ? "View active scan" : trigger.isPending ? "Starting…" : "Scan now"}
        </Button>
      </section>
      {active ? (
        <div className="active-run">
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
          <IntelligenceProfile
            rubricId={data.summary.rubricId}
            choices={data.summary.choices}
            signals={data.summary.signals}
            tags={data.summary.tags}
          />
        </>
      ) : null}
      <section className="run-history">
        <div className="section-kicker">
          <span>CAPTURE STACK</span>
          <LayerDepth count={captured} noun={detail.hasNextPage ? "captures loaded" : "captures"} />
        </div>
        <div className="capture-stack">
          {stack.map(({ run, layer }) => (
            <article className="capture-row" data-live={layer === 1} key={run.id}>
              <span className="capture-index">
                <strong>
                  {layer ? (layer === 1 ? "LIVE" : String(layer).padStart(2, "0")) : "—"}
                </strong>
                <span>{layer ? "LAYER" : "NO LAYER"}</span>
              </span>
              <div>
                <RunStatus status={run.status} />
                <span className="run-trigger">{run.trigger}</span>
              </div>
              <div className="run-time">
                <strong>
                  <RelativeTime value={run.createdAt} />
                </strong>
                <small>{run.errorMessage ?? `Stage: ${run.stage}`}</small>
              </div>
              {run.status === "succeeded" ? (
                <div className="artifact-links">
                  {(["screenshot", "html", "content"] as const).map((kind) => (
                    <Button
                      key={kind}
                      render={<a href={artifactUrl(pageId, run.id, kind)} />}
                      nativeButton={false}
                      variant="link"
                      size="xs"
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
            className="load-more-button"
            variant="outline"
            disabled={detail.isFetchingNextPage}
            onClick={() => detail.fetchNextPage()}
          >
            {detail.isFetchingNextPage ? "Loading…" : "Load older runs"}
          </Button>
        ) : null}
      </section>
    </main>
  );
}

function artifactUrl(pageId: string, runId: string, kind: string) {
  return `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/api/pages/${pageId}/runs/${runId}/artifacts/${kind}`;
}
