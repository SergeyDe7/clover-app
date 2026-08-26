import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxy = {
  "/api": {
    target: "http://127.0.0.1:4100",
    changeOrigin: true,
  },
  "/uploads": {
    target: "http://127.0.0.1:4100",
    changeOrigin: true,
  },
};

/** Hosts that nginx / phones use; missing www → Vite preview 403 and blank open. */
const allowedHosts = [
  "clover-order.ru",
  "www.clover-order.ru",
  "clover-spb.ru",
  "www.clover-spb.ru",
];

const UI_BUILD_PLACEHOLDER = "%CLOVER_UI_BUILD%";

/** Каждый production build получает уникальный тег по hash entry-бандла — иначе localStorage не сбрасывает кэш. */
function cloverUiBuildTag() {
  return {
    name: "clover-ui-build-tag",
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html.replaceAll(UI_BUILD_PLACEHOLDER, "ui-dev");
      }
      return html;
    },
    writeBundle(options, bundle) {
      const entry = Object.values(bundle).find(
        (item) => item.type === "chunk" && item.isEntry
      );
      const hashMatch = String(entry?.fileName || "").match(/index-([A-Za-z0-9_-]+)\.js$/);
      const hash = hashMatch?.[1] || String(Date.now());
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const buildTag = `ui-${date}-${hash}`;
      const indexPath = path.join(options.dir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const html = fs.readFileSync(indexPath, "utf8").replaceAll(UI_BUILD_PLACEHOLDER, buildTag);
      fs.writeFileSync(indexPath, html);
      console.log(`[clover-ui-build] ${buildTag}`);
    },
  };
}

/** index.html / sw.js — без кэша; hashed /assets/* — immutable. */
function cloverPreviewCacheHeaders() {
  return {
    name: "clover-preview-cache-headers",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = String(req.url || "").split("?")[0];
        if (
          url === "/" ||
          url === "/index.html" ||
          url === "/sw.js"
        ) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else if (url === "/manifest.webmanifest") {
          res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
        } else if (url === "/robots.txt" || url === "/sitemap.xml") {
          res.setHeader("Cache-Control", "public, max-age=86400");
        } else if (url.startsWith("/assets/") || url.startsWith("/fonts/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        next();
      });
    },
  };
}

/**
 * SPA fallback must NOT swallow missing hashed assets as index.html —
 * phone then gets HTML as CSS → «только текст без оформления» + 2 логотипа.
 */
function noAssetSpaFallback() {
  return {
    name: "clover-no-asset-spa-fallback",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = String(req.url || "").split("?")[0];
        if (!url.startsWith("/assets/")) {
          next();
          return;
        }
        const filePath = path.resolve(
          server.config.root,
          server.config.build.outDir,
          url.replace(/^\/assets\//, "assets/")
        );
        if (fs.existsSync(filePath)) {
          next();
          return;
        }
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not found");
      });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = String(req.url || "").split("?")[0];
        if (!url.startsWith("/assets/")) {
          next();
          return;
        }
        // Dev: only block obvious missing build hashes under /assets/ if file absent in public/assets
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloverUiBuildTag(), noAssetSpaFallback(), cloverPreviewCacheHeaders()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("\\react\\")) {
            return "vendor-react";
          }
          if (id.includes("xlsx")) return "vendor-xlsx";
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5273,
    strictPort: true,
    proxy,
    allowedHosts,
    cors: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5273,
    strictPort: true,
    proxy,
    allowedHosts,
    cors: true,
  },
});
