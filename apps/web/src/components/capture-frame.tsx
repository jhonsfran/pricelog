import { Button } from "@pricelog/ui/components/button";
import { Skeleton } from "@pricelog/ui/components/skeleton";
import { cn } from "@pricelog/ui/lib/utils";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import { formatStamp } from "@/lib/time";
import { displayUrl } from "@/lib/url";

/**
 * The page as the browser saw it at capture time, in a window frame. A full-page capture runs
 * long, so the frame shows its top and opens to the whole page on request.
 */
export function CaptureFrame({
  src,
  url,
  capturedAt,
  domain,
}: {
  src: string;
  url: string;
  capturedAt: Date | string | number;
  domain: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [open, setOpen] = useState(false);
  return (
    <figure className="min-w-0 border border-gray-6 bg-gray-2 shadow-sheet">
      <div className="flex h-9 items-center gap-3 border-b border-gray-5 px-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2 bg-gray-6" />
          <i className="size-2 bg-gray-6" />
          <i className="size-2 bg-gray-6" />
        </span>
        <span className="min-w-0 flex-1 truncate border border-gray-5 bg-gray-1 px-2.5 py-0.5 text-center font-mono text-2xs text-muted-foreground">
          {displayUrl(url)}
        </span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Open the full capture in a new tab"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      <div className={cn("relative overflow-hidden bg-white", !open && "max-h-[30rem]")}>
        {state === "failed" ? (
          <p className="grid h-60 place-items-center bg-gray-2 text-sm text-muted-foreground">
            The screenshot for this capture is not available.
          </p>
        ) : (
          <>
            {state === "loading" ? <Skeleton className="absolute inset-0 h-[30rem]" /> : null}
            <img
              src={src}
              alt={`The ${domain} pricing page as captured on ${formatStamp(capturedAt)}`}
              loading="lazy"
              decoding="async"
              className={cn(
                "block w-full transition-opacity duration-500",
                state === "ready" ? "opacity-100" : "min-h-[30rem] opacity-0",
              )}
              onLoad={() => setState("ready")}
              onError={() => setState("failed")}
            />
          </>
        )}
        {state === "ready" && !open ? (
          <div className="absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-linear-to-t from-gray-2 via-gray-2/80 to-transparent pb-4">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <ChevronDown data-icon="inline-start" /> Show the whole page
            </Button>
          </div>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-5 px-3 py-2 font-mono text-2xs text-muted-foreground">
        <span>Captured {formatStamp(capturedAt)}</span>
        {open ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <ChevronUp className="size-3" aria-hidden="true" /> Collapse
          </button>
        ) : null}
      </figcaption>
    </figure>
  );
}
