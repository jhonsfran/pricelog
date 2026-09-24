import { LayerMark } from "./layer-mark";

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 font-mono text-xs font-semibold tracking-[0.14em]">
      <LayerMark size={22} />
      PRICELOG
    </span>
  );
}
