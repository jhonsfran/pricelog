import evlog from "evlog/nitro/v3";
import { defineConfig } from "nitro";

const environment =
  process.env.ALCHEMY_DEV === "true" ? "development" : (process.env.NODE_ENV ?? "development");

export default defineConfig({
  serverDir: "./server",
  experimental: {
    asyncContext: true,
  },
  modules: [
    evlog({
      env: { service: "my-better-t-app-web", environment },
      pretty: environment !== "production",
    }),
  ],
});
