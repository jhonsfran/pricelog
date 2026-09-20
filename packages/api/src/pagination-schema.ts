import { z } from "zod";

export const descendingTimestampCursorSchema = z.object({
  createdAt: z.number().int(),
  id: z.string().min(1),
});
