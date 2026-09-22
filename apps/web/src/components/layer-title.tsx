import type { CSSProperties } from "react";

/**
 * A page title printed the way this site stores everything: the live
 * version in front, earlier impressions outlined and offset behind it
 * along the product's one diagonal. The ghosts are hidden from assistive
 * technology so the heading is still announced exactly once.
 */
export function LayerTitle({
  children,
  depth = 2,
  className,
}: {
  children: string;
  depth?: number;
  className?: string;
}) {
  // Page names here are scraped titles and some of them wrap. A full stack
  // behind a two-line heading puts strokes through the line below it, so
  // long titles keep the layering but drop to a single impression.
  const stack = children.length > 34 ? 1 : depth;
  return (
    <span className={className ? `layer-title ${className}` : "layer-title"}>
      <span className="layer-title-stack" aria-hidden="true">
        {Array.from({ length: stack }, (_, index) => (
          <span key={index} style={{ "--layer-i": stack - index } as CSSProperties}>
            {children}
          </span>
        ))}
      </span>
      <span className="layer-title-face">{children}</span>
    </span>
  );
}
