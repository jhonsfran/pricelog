import { Badge } from "@pricelog/ui/components/badge";
import { cn } from "@pricelog/ui/lib/utils";

const STATUS = {
  queued: { label: "Queued", variant: "warning" },
  running: { label: "Running", variant: "warning" },
  succeeded: { label: "Complete", variant: "signal" },
  failed: { label: "Failed", variant: "destructive" },
} as const;

export function RunStatus({ status }: { status: keyof typeof STATUS | null }) {
  const { label, variant } = status
    ? STATUS[status]
    : { label: "Not scanned", variant: "outline" as const };
  return (
    <Badge variant={variant} className="kicker h-6 gap-1.5 text-2xs">
      {/* A polling scan should look alive. Opacity only — no layout, no paint. */}
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "running" && "motion-safe:animate-pulse",
        )}
        aria-hidden="true"
      />
      {label}
      {status === "running" ? <span className="sr-only"> (in progress)</span> : null}
    </Badge>
  );
}
