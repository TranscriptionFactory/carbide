import { resolve } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const KATEX_FALLBACK_SRC =
  /,url\([^)]*KaTeX_[^)]*\.(?:woff|ttf)\)\s*format\((["']?)(?:woff|truetype)\1\)/g;

function katex_woff2_only(): Plugin {
  return {
    name: "katex-woff2-only",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const [file_name, output] of Object.entries(bundle)) {
        if (output.type !== "asset") continue;
        if (/KaTeX_[^/]+\.(?:woff|ttf)$/.test(file_name)) {
          delete bundle[file_name];
        } else if (file_name.endsWith(".css")) {
          const css =
            typeof output.source === "string"
              ? output.source
              : new TextDecoder().decode(output.source);
          if (css.includes("KaTeX_")) {
            output.source = css.replace(KATEX_FALLBACK_SRC, "");
          }
        }
      }
    },
  };
}

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
    katex_woff2_only(),
  ],
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
  resolve: {
    alias: {
      pdfkit: resolve("node_modules/pdfkit/js/pdfkit.standalone.js"),
    },
    ...(process.env.VITEST || process.env.NODE_ENV === "test"
      ? { conditions: ["browser"] }
      : {}),
  },
});
