import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  loader: {
    ".sql": "text",
  },
  deps: {
    alwaysBundle: [/@my-better-t-app\/.*/],
    neverBundle: ["cloudflare:workers"],
  },
});
