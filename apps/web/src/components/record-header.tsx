import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { formatToken } from "@/lib/format";
import { displayUrl } from "@/lib/url";
import { Monogram } from "./monogram";

/**
 * A page record opens with its name beside its mark, then what kind of product it is and where
 * the page lives, then what the page says about itself.
 */
export function RecordHeader({
  domain,
  category,
  url,
  description,
  actions,
}: {
  domain: string;
  category?: string | null;
  url: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <header className="grid gap-5 pt-5 pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0">
        <div className="flex items-center gap-3.5">
          <Monogram domain={domain} className="size-10 text-sm" />
          <h1 className="min-w-0 text-3xl leading-none font-[650] tracking-[-0.03em] wrap-break-word sm:text-4xl">
            {domain}
          </h1>
        </div>
        <p className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="border border-gray-5 px-1.5 text-xs leading-5 text-gray-11">
            {category ? formatToken(category) : "Unclassified"}
          </span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {displayUrl(url)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </p>
        {description ? (
          <p className="mt-2.5 line-clamp-2 max-w-2xl text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
