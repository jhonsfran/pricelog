import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, Play } from "lucide-react";
import { toast } from "sonner";
import { RunStatus } from "@/components/run-status";
import { ScoreGrid } from "@/components/score-grid";
import { ENV } from "@/env.public";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard/pages/$pageId")({
  component: OwnerPageDetail,
});

function OwnerPageDetail() {
  const { pageId } = Route.useParams();
  const detail = useQuery(
    orpc.pages.getOwned.queryOptions({ input: { pageId }, refetchInterval: 5_000 }),
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
  if (detail.isLoading) return <div className="state-page">Loading owner record…</div>;
  if (!detail.data) return <div className="state-page">Page not found.</div>;
  const data = detail.data;
  const active = data.runs.items.find((run) => run.id === data.state?.activeRunId);
  return (
    <main className="dashboard-shell detail-shell">
      <Link className="back-link" to="/dashboard">
        <ArrowLeft size={15} />
        Your pages
      </Link>
      <section className="detail-heading">
        <div>
          <p className="eyebrow">OWNER RECORD</p>
          <h1>{data.page.displayName ?? data.page.normalizedDomain}</h1>
          <p>{data.page.canonicalUrl}</p>
        </div>
        <button
          className="scan-button"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate({ pageId })}
        >
          <Play size={15} />
          {active ? "View active scan" : trigger.isPending ? "Starting…" : "Scan now"}
        </button>
      </section>
      {active ? (
        <div className="active-run">
          <RunStatus status={active.status} />
          <span>Stage: {active.stage}</span>
          <span>Run {active.id.slice(0, 8)}</span>
        </div>
      ) : null}
      {data.summary ? (
        <section className="profile-card owner-score-card">
          <div className="section-kicker">
            <span>LATEST QUALITY SCORE</span>
            <strong>{Math.round(data.summary.overallScore)} / 100</strong>
          </div>
          <ScoreGrid scores={data.summary.scores} />
        </section>
      ) : null}
      <section className="run-history">
        <div className="section-kicker">
          <span>SCAN HISTORY</span>
          <span>{data.runs.items.length} RUNS</span>
        </div>
        {data.runs.items.map((run) => (
          <article className="run-row" key={run.id}>
            <div>
              <RunStatus status={run.status} />
              <span className="run-trigger">{run.trigger}</span>
            </div>
            <div className="run-time">
              <strong>{formatDate(run.createdAt)}</strong>
              <small>{run.errorMessage ?? `Stage: ${run.stage}`}</small>
            </div>
            {run.status === "succeeded" ? (
              <div className="artifact-links">
                {(["screenshot", "html", "content"] as const).map((kind) => (
                  <a key={kind} href={artifactUrl(pageId, run.id, kind)}>
                    <Download size={13} />
                    {kind}
                  </a>
                ))}
              </div>
            ) : (
              <span />
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function artifactUrl(pageId: string, runId: string, kind: string) {
  return `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/api/pages/${pageId}/runs/${runId}/artifacts/${kind}`;
}
function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
