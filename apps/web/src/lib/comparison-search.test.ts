import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { parseComparisonSearch } from "./comparison-search";

function openComparison(url: string) {
  const root = createRootRoute();
  const comparison = createRoute({
    getParentRoute: () => root,
    path: "/benchmarks",
    validateSearch: parseComparisonSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([comparison]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  return router.matchRoutes(router.state.location).at(-1)!.search;
}

describe("comparison URLs", () => {
  it("opens category and topic selections", async () => {
    const search = await openComparison("/benchmarks?cohort=category%3Aapp_builders&topic=prices");
    expect(search).toMatchObject({
      cohort: "category:app_builders",
      topic: "prices",
    });
  });

  it("clears invalid selections retained by the router instead of passing them to the API", async () => {
    const search = await openComparison("/benchmarks?cohort=unknown&topic=unknown");
    expect(search.cohort).toBeUndefined();
    expect(search.topic).toBeUndefined();
  });
});
