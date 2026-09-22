/**
 * Three captures of the same page, stepping up and to the right. They
 * overlap far enough that the silhouette reads as one diagonal bar, and
 * the leading square carries the primary colour. Drawn on a 24-unit grid
 * so it stays sharp at any size.
 */
export function LayerMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `layer-mark ${className}` : "layer-mark"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect data-depth="3" x="0" y="13" width="11" height="11" />
      <rect data-depth="2" x="6.5" y="6.5" width="11" height="11" />
      <rect data-depth="1" x="13" y="0" width="11" height="11" />
    </svg>
  );
}
