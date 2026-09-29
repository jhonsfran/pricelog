import { createAuthClient } from "better-auth/react";

import { apiOrigin } from "./url";

export const authClient = createAuthClient({
  baseURL: apiOrigin(),
});
