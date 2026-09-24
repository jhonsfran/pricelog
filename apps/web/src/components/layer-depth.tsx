/** How many captures sit behind a record. Only rendered where the count is real. */
export function LayerDepth({ count, noun = "captures" }: { count: number; noun?: string }) {
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="inline-flex h-2.75 items-end gap-0.5" aria-hidden="true">
        <i className="block h-1.25 w-0.75 bg-gray-7" />
        <i className="block h-2 w-0.75 bg-gray-7" />
        <i className="block h-2.75 w-0.75 bg-foreground" />
      </span>
      {count} {count === 1 ? noun.replace(/s$/, "") : noun}
    </span>
  );
}
