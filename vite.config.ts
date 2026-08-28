import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5473,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 5473,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
