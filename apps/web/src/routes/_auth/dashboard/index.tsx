import { Field, FieldLabel } from "@my-better-t-app/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@my-better-t-app/ui/components/input-group";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Lede,
  Notice,
  PageHeader,
  PageShell,
  RecordIdentity,
  RowArrow,
  RowLink,
  SectionHeading,
} from "@/components/page";
import { RunStatus } from "@/components/run-status";
import { staggerDelay } from "@/lib/animation";
import { displayUrl } from "@/lib/url";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/")({ component: DashboardPage });

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

  return (
    <PageShell>
      <PageHeader
        eyebrow="Pricing page monitoring"
        title="Your pages"
        aside={<Lede>Add a pricing page to capture its published terms each week.</Lede>}
      />
      <form
        className="mt-9 mb-16"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) createPage.mutate({ url: url.trim() });
        }}
      >
        <Field>
          <FieldLabel htmlFor="pricing-url" className="text-muted-foreground">
            Pricing page URL
          </FieldLabel>
          <InputGroup className="h-14">
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
                className="h-10 px-4"
                disabled={createPage.isPending}
              >
                <Plus data-icon="inline-start" />
                {createPage.isPending ? "Adding…" : "Add page"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>
      <section className="border-t border-gray-7">
        <SectionHeading title="Pricing pages" meta={pages.data?.length ?? 0} />
        {pages.isLoading ? (
          <OwnerSkeleton />
        ) : pages.data?.length ? (
          pages.data.map((item, index) => (
            <RowLink
              key={item.id}
              className="grid-cols-[minmax(13.75rem,1fr)_7.25rem_9.5rem_1.25rem] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:py-4"
              to="/dashboard/pages/$pageId"
              params={{ pageId: item.id }}
              style={{ animationDelay: staggerDelay(index) }}
            >
              <RecordIdentity
                name={item.normalizedDomain}
                address={displayUrl(item.canonicalUrl)}
              />
              <RunStatus status={item.lastRunStatus} />
              <span className="kicker text-muted-foreground max-md:hidden">
                {item.nextScanAt ? `Next ${formatDate(item.nextScanAt)}` : "Scheduling"}
              </span>
              <RowArrow className="max-md:hidden" />
            </RowLink>
          ))
        ) : (
          <Notice>Add your first pricing page to start its initial scan.</Notice>
        )}
      </section>
    </PageShell>
  );
}

/** Holds the row rhythm while owned pages load, so results never shift the page. */
function OwnerSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="grid min-h-20 content-center gap-2 border-b border-gray-4" key={index}>
          <Skeleton className="h-2.5" style={{ width: `${38 + index * 9}%` }} />
          <Skeleton className="h-2 w-[24%]" />
        </div>
      ))}
    </div>
  );
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
