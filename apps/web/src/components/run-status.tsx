const STATUS_LABELS = {
  queued: "Queued",
  running: "Running",
  succeeded: "Complete",
  failed: "Failed",
} as const;

export function RunStatus({ status }: { status: keyof typeof STATUS_LABELS | null }) {
  if (!status) return <span className="run-status run-status-neutral">Not scanned</span>;
  return (
    <span className={`run-status run-status-${status}`}>
      {STATUS_LABELS[status]}
      {status === "running" ? <span className="sr-only"> (in progress)</span> : null}
    </span>
  );
}
