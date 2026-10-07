import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouterAppContext } from "./__root";
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

function homepage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<RouterAppContext>()({ component: Outlet });
  const index = IndexRoute.update({ getParentRoute: () => root, id: "/", path: "/" });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    context: { queryClient, orpc },
    history: createMemoryHistory({ initialEntries: ["/"] }),
    isServer: true,
  });
  return {
    queryClient,
    router,
    render: () =>
      renderToString(
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      ),
  };
}

afterEach(() => {
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
    expect(app.render()).toContain("The directory is not available.");
    app.queryClient.clear();
  });
});
