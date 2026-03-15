import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

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
  plugins: [sveltekit(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: manual_chunks,
      },
    },
  },
  optimizeDeps: {
    include: ["d3-force"],
  },
  worker: {
    format: "es",
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
  },
});
