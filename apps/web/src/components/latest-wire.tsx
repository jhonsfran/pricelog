import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RelativeTime } from "@/components/relative-time";
import { isFresh, toDate } from "@/lib/time";

export type WireItem = {
  slug: string;
  name: string;
  scannedAt: Date | string | number;
};

const ROTATE_MS = 6_000;
const MAX_ITEMS = 6;

/**
 * One line of what was captured most recently. It rotates rather than
 * scrolls: a marquee is harder to read than a line that sits still, and
 * this is a record before it is a headline. Reduced motion pins it to
 * the newest capture and stops there.
 */
export function LatestWire({ items, total }: { items: WireItem[]; total?: number }) {
  const recent = [...items]
    .sort((left, right) => toDate(right.scannedAt).getTime() - toDate(left.scannedAt).getTime())
    .slice(0, MAX_ITEMS);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (recent.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => current + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [recent.length]);

  if (recent.length === 0) return null;
  const item = recent[index % recent.length]!;
  const newest = recent[0]!;

  return (
    <div className="wire" aria-label="Latest captures">
      <span className="wire-label">
        <span className="live-dot" data-live={isFresh(newest.scannedAt)} aria-hidden="true" />
        Latest
      </span>
      <Link
        className="wire-item"
        key={item.slug}
        to="/pages/$slug"
        params={{ slug: item.slug }}
        title={item.name}
      >
        <strong>{item.name}</strong>
        <span>captured</span>
        <RelativeTime value={item.scannedAt} />
      </Link>
      {total ? <span className="wire-count">{total} pages on record</span> : null}
    </div>
  );
}
