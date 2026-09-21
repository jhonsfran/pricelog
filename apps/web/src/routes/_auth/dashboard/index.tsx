import { Field, FieldLabel } from "@my-better-t-app/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@my-better-t-app/ui/components/input-group";
import { Skeleton } from "@my-better-t-app/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { toast } from "sonner";
import { RunStatus } from "@/components/run-status";
import { staggerDelay } from "@/lib/animation";
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
    <main className="dashboard-shell">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">OWNER CONSOLE</p>
          <h1>Your pages</h1>
        </div>
        <p>
          Each successful scan schedules the next scan seven days later. A failed scan retries the
          next day.
        </p>
      </section>
      <form
        className="add-page-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) createPage.mutate({ url: url.trim() });
        }}
      >
        <Field>
          <FieldLabel htmlFor="pricing-url">PRICING PAGE URL</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="pricing-url"
              type="url"
              required
              placeholder="https://example.com/pricing"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" disabled={createPage.isPending}>
                <Plus data-icon="inline-start" />
                {createPage.isPending ? "Adding…" : "Add page"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>
      <section className="owner-list">
        <div className="section-kicker">
          <span>MONITORED PAGES</span>
          <span>{pages.data?.length ?? 0}</span>
        </div>
        {pages.isLoading ? (
          <OwnerSkeleton />
        ) : pages.data?.length ? (
          pages.data.map((item, index) => (
            <Link
              key={item.id}
              className="owner-row row-enter"
              to="/dashboard/pages/$pageId"
              params={{ pageId: item.id }}
              style={{ "--enter-delay": staggerDelay(index) } as CSSProperties}
            >
              <span className="page-identity">
                <strong>{item.displayName ?? item.normalizedDomain}</strong>
                <small>{item.canonicalUrl}</small>
              </span>
              <RunStatus status={item.lastRunStatus} />
              <span className="next-scan">
                {item.nextScanAt ? `Next ${formatDate(item.nextScanAt)}` : "Scheduling"}
              </span>
              <ArrowRight size={17} className="row-arrow" aria-hidden="true" />
            </Link>
          ))
        ) : (
          <div className="directory-message">
            Add your first pricing page to start its initial scan.
          </div>
        )}
      </section>
    </main>
  );
}

/** Holds the row rhythm while owned pages load, so results never shift the page. */
function OwnerSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <Skeleton className="skeleton-bar" style={{ width: `${38 + index * 9}%` }} />
          <Skeleton className="skeleton-bar h-2" style={{ width: "24%" }} />
        </div>
      ))}
    </div>
  );
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
