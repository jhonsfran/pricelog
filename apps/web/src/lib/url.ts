import { ENV } from "@/env.public";

/** An absolute URL on the API server, for archived sources and artifacts. */
export function serverUrl(path: string) {
  return `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${path}`;
}
