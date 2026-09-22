/** How many captures sit behind a record. Only rendered where the count is real. */
export function LayerDepth({ count, noun = "captures" }: { count: number; noun?: string }) {
  return (
    <span className="layer-depth">
      <span className="layer-depth-glyph" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {count} {count === 1 ? noun.replace(/s$/, "") : noun}
    </span>
  );
}
