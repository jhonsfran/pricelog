import { waitlistEntry } from "@pricelog/db/schema/waitlist";
import { z } from "zod";

import { publicProcedure } from "../index";

export const waitlistRouter = {
  /**
   * A new address and an already listed one get the same answer, and a repeat writes nothing, so
   * no response tells a caller who is on the list.
   */
  join: publicProcedure
    // Normalize before the format check: `z.email().trim()` rejects padded input.
    .input(z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()) }))
    .handler(async ({ context, input }) => {
      await context.db
        .insert(waitlistEntry)
        .values({ id: crypto.randomUUID(), email: input.email })
        .onConflictDoNothing();
      return { email: input.email };
    }),
};
