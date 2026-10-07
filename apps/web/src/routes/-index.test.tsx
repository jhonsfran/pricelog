// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as RootRoute } from "./__root";
import { Route as IndexRoute } from "./index";
import { directoryCardsOptions, directoryOverviewOptions } from "@/lib/directory-queries";
import { orpc } from "@/utils/orpc";

vi.mock("@/env.public", () => ({ ENV: { VITE_SERVER_URL: "https://api.example.com" } }));

const cards = {
  items: [
    {
      id: "page-botpress",
      slug: "botpress.com",
      normalizedDomain: "botpress.com",
      category: "voice_agents",
      tags: [],
      scannedAt: "2026-10-07T12:00:00.000Z",
      ladder: [],
      entry: "$20/mo",
      plans: 1,
    },
  ],
  total: 1,
  nextCursor: null,
};
const overview = { pages: 1, plans: 1, prices: 1, latestScanAt: null };

function mockRpc(failingRoute: "cards" | "overview") {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (request) => {
      const path = new URL(request instanceof Request ? request.url : String(request)).pathname;
      if (path === `/rpc/directory/${failingRoute}`) {
        return Response.json(
          {
            json: {
              defined: false,
              code: "INTERNAL_SERVER_ERROR",
              status: 500,
              message: `${failingRoute} unavailable`,
            },
          },
          { status: 500 },
        );
      }
      if (path === "/rpc/directory/cards") return Response.json({ json: cards });
      if (path === "/rpc/directory/overview") return Response.json({ json: overview });
      throw new Error(`Unexpected HTTP request ${path}`);
    }),
  );
}

function homepage(
  isServer = true,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const root = RootRoute.update({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: IndexRoute.options.component,
    validateSearch: IndexRoute.options.validateSearch,
    loaderDeps: IndexRoute.options.loaderDeps,
    loader: IndexRoute.options.loader,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    context: { queryClient, orpc },
    history: createMemoryHistory({ initialEntries: ["/"] }),
    isServer,
  });
  return {
    queryClient,
    router,
    mount: async () => {
      const client = homepage(false, queryClient);
      await client.router.load();
      return render(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={client.router} />
        </QueryClientProvider>,
      );
    },
    render: () =>
      renderToString(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      ),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("homepage preload failures", () => {
  it("renders directory rows when the overview preload fails", async () => {
    mockRpc("overview");
    const app = homepage();
    await app.router.load();

    expect(app.router.state.matches.find((match) => match.routeId === "/")?.status).toBe("success");
    expect(app.queryClient.getQueryData(directoryCardsOptions().queryKey)).toMatchObject({
      pages: [cards],
    });
    expect(app.render()).toContain("botpress.com");
    app.queryClient.clear();
  });

  it("renders overview totals and the directory error when the cards preload fails", async () => {
    mockRpc("cards");
    const app = homepage();
    await app.router.load();

    expect(app.router.state.matches.find((match) => match.routeId === "/")?.status).toBe("success");
    expect(app.queryClient.getQueryData(directoryOverviewOptions().queryKey)).toEqual(overview);
    expect(app.queryClient.getQueryState(directoryCardsOptions().queryKey)?.status).toBe("error");
    expect(app.render()).toContain('class="tabular-nums">1</span>');
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await app.mount();
    expect(await screen.findByText("The directory is not available.")).toBeDefined();
    app.queryClient.clear();
  });
});
