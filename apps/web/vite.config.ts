import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4100,
    proxy: {
      "/rpc": { target: "http://localhost:4000", changeOrigin: true },
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
