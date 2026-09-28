import { describe, expect, it, vi } from "vitest";
import { isStalled, STALLED_RUN_MS } from "./page-store";
import type { PageRunDto } from "./types";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
vi.mock("./drizzle/migrations.js", () => ({ default: { migrations: {} } }));

const run = (createdAt: number, eventTimes: number[]): PageRunDto => ({
  id: "run",
  trigger: "manual",
  status: "running",
  stage: "capture",
  requestedByUserId: null,
  browserEngine: null,
  errorCode: null,
  errorMessage: null,
  createdAt,
  startedAt: createdAt,
  completedAt: null,
  events: eventTimes.map((at) => ({ stage: "capture", at, kind: "entered" })),
});

describe("stalled scan runs", () => {
  it("treats a run silent for longer than the limit as stalled", () => {
    expect(isStalled(run(0, [1_000]), 1_000 + STALLED_RUN_MS + 1)).toBe(true);
  });

  it("keeps a run that reported progress recently", () => {
    expect(isStalled(run(0, [5 * 60_000]), 20 * 60_000)).toBe(false);
  });
});
