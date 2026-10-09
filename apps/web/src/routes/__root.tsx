import { Toaster } from "@pricelog/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createMiddleware } from "@tanstack/react-start";
import { evlogErrorHandler } from "evlog/nitro/v3";

import type { orpc } from "@/utils/orpc";

import Header from "../components/header";
import { SiteFooter } from "../components/site-footer";

import appCss from "../index.css?url";
export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },

  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Pricelog — The open pricing index",
      },
      {
        name: "description",
        content:
          "The open pricing index for AI products. Compare prices, track changes, and explore captured pricing pages.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "Pricelog",
      },
      {
        property: "og:title",
        content: "Pricelog — The open pricing index",
      },
      {
        property: "og:description",
        content:
          "The open pricing index for AI products. Compare prices, track changes, and explore captured pricing pages.",
      },
      {
        property: "og:image",
        content: "https://usepricelog.com/og.png",
      },
      {
        property: "og:image:type",
        content: "image/png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:alt",
        content: "Pricelog. Pricing pages change quietly. We keep the record.",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "Pricelog — The open pricing index",
      },
      {
        name: "twitter:description",
        content:
          "The open pricing index for AI products. Compare prices, track changes, and explore captured pricing pages.",
      },
      {
        name: "twitter:image",
        content: "https://usepricelog.com/og.png",
      },
      {
        name: "twitter:image:alt",
        content: "Pricelog. Pricing pages change quietly. We keep the record.",
      },
    ],
    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* The footer sits at the bottom of the viewport even on a short page. */}
        <div className="flex min-h-svh flex-col">
          <Header />
          <div className="flex-1">
            <Outlet />
          </div>
          <SiteFooter />
        </div>
        <Toaster richColors />
        {import.meta.env.DEV ? (
          <>
            <TanStackRouterDevtools position="bottom-left" />
            <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
          </>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
