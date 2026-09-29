import { publicScreenshotUrl } from "@pricelog/api/page-versions";
import type { DescendingTimestampCursor } from "@pricelog/api/pagination";
import { Button, buttonVariants } from "@pricelog/ui/components/button";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { AtAGlance } from "@/components/at-a-glance";
import { CaptureFrame } from "@/components/capture-frame";
import { NumericPricesPanel } from "@/components/numeric-prices";
import {
  CaptureHistory,
  CollectionDetails,
  ReviewClaims,
  ScanProgress,
} from "@/components/owner-panels";
import { BackLink, Notice, PageShell, StatePage } from "@/components/page";
import { PlanGrid, SharedPrices } from "@/components/plan-grid";
import { PricingFactsPanel } from "@/components/pricing-facts";
import { RecordHeader } from "@/components/record-header";
import { serverUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/pages/$pageId")({
  component: OwnerPageDetail,
});

/**
 * The owner's record is the public record plus everything behind it: how each capture was read,
 * the claims that did not publish, and every scan with its artifacts.
 */
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
  if (detail.isLoading) return <StatePage loading text="Loading your page…" />;
  const pages = detail.data?.pages;
  if (!pages?.length) return <StatePage text="Page not found." />;
  const data = pages[0]!;
  const runs = pages.flatMap((result) => result.runs.items);
  const active = runs.find((run) => run.id === data.state?.activeRunId);
  const summary = data.summary;
  const category = summary?.choices.find((choice) => choice.key === "product_category")?.choice;
  const published = data.page.state === "active";
  const sourceUrl = summary ? `/api/public/pages/${pageId}/runs/${summary.runId}/source` : null;

  return (
    <PageShell>
      <BackLink to="/dashboard">Your pages</BackLink>
      <RecordHeader
        domain={data.page.normalizedDomain}
        category={category}
        url={data.page.canonicalUrl}
        description={data.page.description}
        actions={
          <>
            {published ? (
              <Link
                to="/pages/$slug"
                params={{ slug: data.page.slug }}
                className={buttonVariants({ variant: "outline" })}
              >
                Public record
              </Link>
            ) : null}
            <Button
              variant={active ? "outline" : "default"}
              disabled={trigger.isPending || Boolean(active)}
              onClick={() => trigger.mutate({ pageId })}
            >
              <Play data-icon="inline-start" />
              {active ? "Scan running" : trigger.isPending ? "Starting…" : "Scan now"}
            </Button>
          </>
        }
      />
      <div className="border-t border-gray-5" />
      {active ? <ScanProgress run={active} /> : null}
      {summary ? (
        <>
          <div className="grid gap-8 pt-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,1fr)]">
            <div className="mt-2.5 mr-2.5 min-w-0">
              {published ? (
                <CaptureFrame
                  key={summary.runId}
                  src={serverUrl(publicScreenshotUrl(pageId, summary.runId))}
                  url={data.page.canonicalUrl}
                  capturedAt={summary.scannedAt}
                  domain={data.page.normalizedDomain}
                />
              ) : null}
            </div>
            <aside className="grid content-start gap-4">
              <AtAGlance
                snapshot={summary.snapshot}
                choices={summary.choices}
                signals={summary.signals}
              />
              <CollectionDetails summary={summary} />
            </aside>
          </div>
          {summary.snapshot?.status === "collected" ? (
            <>
              <PlanGrid key={summary.runId} snapshot={summary.snapshot} />
              <SharedPrices prices={summary.snapshot.shared_prices ?? []} />
            </>
          ) : summary.snapshot?.reason ? (
            <Notice className="mt-10 border-t">{summary.snapshot.reason}</Notice>
          ) : (
            <>
              <NumericPricesPanel prices={summary.numericPrices} sourceUrl={sourceUrl} />
              <PricingFactsPanel facts={summary.pricingFacts} sourceUrl={sourceUrl} />
            </>
          )}
          <ReviewClaims review={summary.review} />
        </>
      ) : (
        <p className="mt-7 border border-dashed border-gray-6 px-5 py-6 text-sm text-muted-foreground">
          No capture has been published yet. The first scan runs as soon as the page is added; its
          record appears here when it finishes.
        </p>
      )}
      <CaptureHistory pageId={pageId} runs={runs} more={detail.hasNextPage} />
      {detail.hasNextPage ? (
        <Button
          className="mx-auto mt-6 flex"
          variant="outline"
          disabled={detail.isFetchingNextPage}
          onClick={() => detail.fetchNextPage()}
        >
          {detail.isFetchingNextPage ? "Loading…" : "Load older scans"}
        </Button>
      ) : null}
    </PageShell>
  );
}
