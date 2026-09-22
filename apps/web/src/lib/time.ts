const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toDate(value: Date | string | number) {
  return value instanceof Date ? value : new Date(value);
}

const dayFormat = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const datelineFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const clockFormat = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const stampFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** 22 SEP 2026 — every published date on this site is UTC. */
export function formatDay(value: Date | string | number) {
  return dayFormat.format(toDate(value)).toUpperCase();
}

/**
 * MON 22 SEP 2026. en-GB puts the day first, which is how a dateline is
 * set, but it abbreviates September to "Sept" — and a masthead that
 * changes width for one month of the year is a bug, not a detail.
 */
export function formatDateline(value: Date | string | number) {
  return datelineFormat
    .format(toDate(value))
    .replace(/,/g, "")
    .replace("Sept", "Sep")
    .toUpperCase();
}

export function formatClock(value: Date | string | number) {
  return `${clockFormat.format(toDate(value))} UTC`;
}

/** The full stamp, kept for title attributes so the exact time is never lost. */
export function formatStamp(value: Date | string | number) {
  return `${stampFormat.format(toDate(value))} UTC`;
}

/**
 * A record that landed this morning should not read as a date. Recent
 * captures get elapsed time; anything past a week reverts to the date,
 * because "43d ago" is worse than the day it happened.
 */
export function relativeTime(value: Date | string | number, now = Date.now()) {
  const elapsed = now - toDate(value).getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return formatDay(value);
}

/** True while a capture is recent enough to be worth marking as live. */
export function isFresh(value: Date | string | number, now = Date.now(), within = DAY) {
  const elapsed = now - toDate(value).getTime();
  return elapsed >= 0 && elapsed < within;
}
