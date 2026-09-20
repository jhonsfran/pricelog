import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RunStatus } from "@/components/run-status";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({ component: DashboardPage });

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
        <label htmlFor="pricing-url">PRICING PAGE URL</label>
        <div>
          <input
            id="pricing-url"
            type="url"
            required
            placeholder="https://example.com/pricing"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="submit" disabled={createPage.isPending}>
            <Plus size={16} />
            {createPage.isPending ? "Adding…" : "Add page"}
          </button>
        </div>
      </form>
      <section className="owner-list">
        <div className="section-kicker">
          <span>MONITORED PAGES</span>
          <span>{pages.data?.length ?? 0}</span>
        </div>
        {pages.isLoading ? (
          <div className="directory-message">Loading your pages…</div>
        ) : pages.data?.length ? (
          pages.data.map((item) => (
            <Link
              key={item.id}
              className="owner-row"
              to="/dashboard/pages/$pageId"
              params={{ pageId: item.id }}
            >
              <span className="page-identity">
                <strong>{item.displayName ?? item.normalizedDomain}</strong>
                <small>{item.canonicalUrl}</small>
              </span>
              <RunStatus status={item.lastRunStatus} />
              <span className="owner-score">
                {item.overallScore === null ? "—" : Math.round(item.overallScore)}
              </span>
              <span className="next-scan">
                {item.nextScanAt ? `Next ${formatDate(item.nextScanAt)}` : "Scheduling"}
              </span>
              <ArrowRight size={17} />
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

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
