import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { directoryRouter } from "./directory";
import { pagesRouter } from "./pages";
import { waitlistRouter } from "./waitlist";

export const appRouter = {
  directory: directoryRouter,
  pages: pagesRouter,
  waitlist: waitlistRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
