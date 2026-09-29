import { ENV } from "@/env.public";

const configuredApiOrigin = ENV.VITE_SERVER_URL.replace(/\/$/, "");
const localApiProxy =
  import.meta.env.DEV && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(configuredApiOrigin);

/** Keep local browser requests on the web origin; Vite forwards them to the API. */
export function apiOrigin() {
  return localApiProxy && typeof window !== "undefined"
    ? window.location.origin
    : configuredApiOrigin;
}

/** A link to archived sources and artifacts, through the local proxy in development. */
export function serverUrl(path: string) {
  return `${localApiProxy ? "" : configuredApiOrigin}${path}`;
}

/** An address as a reader says it: no scheme, no trailing slash. */
export function displayUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
