import { useEffect, useState } from "react";
import { formatDay, formatStamp, relativeTime, toDate } from "@/lib/time";

/**
 * Elapsed time has to be computed against the reader's clock, which the
 * server does not have. The absolute UTC date renders first so the markup
 * matches on both sides, then the elapsed form takes over after mount.
 */
export function RelativeTime({
  value,
  className,
}: {
  value: Date | string | number;
  className?: string;
}) {
  const iso = toDate(value).toISOString();
  const [label, setLabel] = useState(() => formatDay(value));

  useEffect(() => {
    function update() {
      setLabel(relativeTime(iso));
    }
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time className={className} dateTime={iso} title={formatStamp(iso)}>
      {label}
    </time>
  );
}
