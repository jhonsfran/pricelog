import { useEffect, useState } from "react";
import { formatClock, formatDateline } from "@/lib/time";

/**
 * A newspaper dateline for a record that is still being written. The
 * clock is client-only — the server has no reader clock to render — so
 * the slot reserves its width in CSS rather than shifting on hydration.
 */
export function Dateline() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    // Minute resolution. A ticking second hand in a masthead is noise.
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="dateline">
      {now ? (
        <>
          <span>{formatDateline(now)}</span>
          <span aria-hidden="true">·</span>
          <span className="dateline-clock">{formatClock(now)}</span>
        </>
      ) : null}
    </p>
  );
}
