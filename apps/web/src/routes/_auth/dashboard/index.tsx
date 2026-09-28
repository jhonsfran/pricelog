import { Field, FieldLabel } from "@pricelog/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@pricelog/ui/components/input-group";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Monogram } from "@/components/monogram";
import { Lede, Notice, PageHeader, PageShell, RowArrow, RowLink } from "@/components/page";
import { RunStatus } from "@/components/run-status";
import { staggerDelay } from "@/lib/animation";
import { formatDay } from "@/lib/time";
import { displayUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/")({ component: DashboardPage });

const row =
  "grid grid-cols-[minmax(0,1.6fr)_8rem_8.5rem_6.5rem_1rem] items-center gap-5 max-md:grid-cols-[minmax(0,1fr)_auto]";

function DashboardPage() {
  const pages = useQuery(orpc.pages.listOwned.queryOptions());
  const [url, setUrl] = useState("");
  const createPage = useMutation(
    orpc.pages.create.mutationOptions({
      onSuccess: async () => {
        setUrl("");
        await pages.refetch();
        toast.success("Pricing page added. The first scan is queued.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const count = pages.data?.length ?? 0;

  return (
    <PageShell>
      <PageHeader eyebrow="Your pages" title="Pages you track">
        <Lede>
          Each page is captured now, then every week. You see everything collected, including the
          claims that did not pass verification.
        </Lede>
      </PageHeader>
      <form
        className="border border-gray-5 bg-gray-2/40 p-4 sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) createPage.mutate({ url: url.trim() });
        }}
      >
        <Field>
          <FieldLabel htmlFor="pricing-url">Track a pricing page</FieldLabel>
          <InputGroup className="h-12 bg-background">
            <InputGroupInput
              id="pricing-url"
              type="url"
              required
              className="px-4 text-base md:text-base"
              placeholder="https://example.com/pricing"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="sm"
                className="h-9 px-4"
                disabled={createPage.isPending}
              >
                <Plus data-icon="inline-start" />
                {createPage.isPending ? "Adding…" : "Add page"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <p className="mt-2.5 text-xs text-muted-foreground">
          The first capture takes a few minutes. Its public record appears once it is verified.
        </p>
      </form>
      <section className="mt-10" aria-labelledby="tracked-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="tracked-title" className="text-2xl tracking-[-0.02em]">
            Tracked pages
          </h2>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {pages.isLoading ? "Reading…" : `${count} ${count === 1 ? "page" : "pages"}`}
          </span>
        </div>
        <div className="mt-4">
          <div className={`kicker h-9 border-b text-muted-foreground max-md:hidden ${row}`}>
            <span>Page</span>
            <span>Last scan</span>
            <span>Next capture</span>
            <span>Record</span>
            <span aria-hidden="true" />
          </div>
          {pages.isLoading ? (
            <OwnerSkeleton />
          ) : pages.data?.length ? (
            pages.data.map((item, index) => (
              <RowLink
                key={item.id}
                className={row}
                to="/dashboard/pages/$pageId"
                params={{ pageId: item.id }}
                style={{ animationDelay: staggerDelay(index) }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Monogram domain={item.normalizedDomain} />
                  <span className="flex min-w-0 flex-col">
                    <strong className="truncate text-[0.9375rem] leading-tight font-semibold">
                      {item.normalizedDomain}
                    </strong>
                    <small className="truncate font-mono text-2xs text-muted-foreground">
                      {displayUrl(item.canonicalUrl)}
                    </small>
                  </span>
                </span>
                <RunStatus status={item.lastRunStatus} />
                <span className="font-mono text-2xs text-muted-foreground max-md:hidden">
                  {item.nextScanAt ? formatDay(item.nextScanAt) : "Scheduling"}
                </span>
                <span className="max-md:hidden">
                  {item.state === "active" ? (
                    <span className="border border-signal-6 px-1.5 text-xs leading-5 text-signal-11">
                      Public
                    </span>
                  ) : (
                    <span className="border border-gray-5 px-1.5 text-xs leading-5 text-muted-foreground">
                      Pending
                    </span>
                  )}
                </span>
                <RowArrow className="max-md:hidden" />
              </RowLink>
            ))
          ) : (
            <Notice>Add your first pricing page above to start its first capture.</Notice>
          )}
        </div>
      </section>
    </PageShell>
  );
}

/** Holds the row rhythm while owned pages load, so results never shift the page. */
function OwnerSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="flex min-h-14 items-center gap-3 border-b border-gray-4" key={index}>
          <Skeleton className="size-8" />
          <Skeleton className="h-2.5" style={{ width: `${26 + index * 9}%` }} />
        </div>
      ))}
    </div>
  );
}
