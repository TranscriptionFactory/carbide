import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function manual_chunks(id: string): string | undefined {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (id.includes("pdfjs-dist")) {
    return "pdf";
  }

  if (id.includes("@xterm") || id.includes("tauri-pty")) {
    return "terminal";
  }

  if (id.includes("mermaid")) {
    return "mermaid";
  }

  if (id.includes("pdfkit")) {
    return "pdfkit";
  }

  if (
    id.includes("codemirror") ||
    id.includes("@codemirror") ||
    id.includes("prismjs")
  ) {
    return "editor-viewer";
  }

  return undefined;
}

export default defineConfig({
  plugins: [
    sveltekit(),
    tailwindcss(),
    nodePolyfills({
      include: ["stream", "buffer", "process", "events", "util"],
    }),
  ],
  define: {
    __dirname: '""',
  },
  build: {
    chunkSizeWarningLimit: 3500,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (
          warning.code === "MISSING_GLOBAL_NAME" &&
          warning.message.includes("d3-force")
        )
          return;
        defaultHandler(warning);
      },
      output: {
        manualChunks: manual_chunks,
      },
    },
  },
  optimizeDeps: {
    include: ["d3-force"],
  },
  ssr: {
    noExternal: ["d3-force"],
  },
  worker: {
    format: "iife",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  css: {
    transformer: "lightningcss",
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    alias: {
      "tauri-pty": new URL(
        "node_modules/tauri-pty/dist/index.es.js",
        import.meta.url,
      ).pathname,
    },
  },
});
