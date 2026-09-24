/**
 * A page title printed the way this site stores everything: the live
 * version in front, earlier impressions outlined and offset behind it
 * along the product's one diagonal. The ghosts are hidden from assistive
 * technology so the heading is still announced exactly once.
 */
export function LayerTitle({ children, depth = 2 }: { children: string; depth?: number }) {
  // Page names here are scraped titles and some of them wrap. A full stack
  // behind a two-line heading puts strokes through the line below it, so
  // long titles keep the layering but drop to a single impression.
  const stack = children.length > 34 ? 1 : depth;
  return (
    <span className="relative isolate inline-block">
      <span className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        {Array.from({ length: stack }, (_, index) => {
          const layer = stack - index;
          return (
            <span
              key={layer}
              // inset-0 rather than a bare origin, so a ghost wraps on exactly
              // the same words as the face it sits behind.
              className="absolute inset-0 text-transparent [-webkit-text-stroke:max(1px,0.014em)_var(--color-gray-7)] motion-safe:animate-layer-fan"
              style={{
                opacity: 1 / (layer + 0.7),
                translate: `${layer * 0.055}em ${layer * -0.055}em`,
                animationDelay: `${layer * 70}ms`,
              }}
            >
              {children}
            </span>
          );
        })}
      </span>
      <span className="relative">{children}</span>
    </span>
  );
}
