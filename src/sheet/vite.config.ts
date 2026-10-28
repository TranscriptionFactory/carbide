import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: "./",
  build: {
    outDir: resolve(__dirname, "../../src-tauri/sheet-dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
