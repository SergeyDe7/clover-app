import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  renderPublicRouteHtml,
  resolvePublicRouteRequest,
} from "./src/shared/sitemap/publicRouteHtml.js";

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
const PUBLIC_LOCALE_ROUTES_PLACEHOLDER = "%CLOVER_PUBLIC_LOCALE_ROUTES%";

function publicLocaleRoutesBuildValue() {
  return String(process.env.CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED || "").trim() === "1"
    ? "enabled"
    : "disabled";
}

/** Каждый production build получает уникальный тег по hash entry-бандла — иначе localStorage не сбрасывает кэш. */
function cloverUiBuildTag() {
  return {
    name: "clover-ui-build-tag",
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        return html
          .replaceAll(UI_BUILD_PLACEHOLDER, "ui-dev")
          .replaceAll(
            PUBLIC_LOCALE_ROUTES_PLACEHOLDER,
            publicLocaleRoutesBuildValue()
          );
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
      if (fs.existsSync(indexPath)) {
        const html = fs
          .readFileSync(indexPath, "utf8")
          .replaceAll(UI_BUILD_PLACEHOLDER, buildTag)
          .replaceAll(
            PUBLIC_LOCALE_ROUTES_PLACEHOLDER,
            publicLocaleRoutesBuildValue()
          );
        fs.writeFileSync(indexPath, html);
      }
      // Stamp SW so installed PWAs detect a new worker every deploy (byte change → install/activate).
      const swPath = path.join(options.dir, "sw.js");
      if (fs.existsSync(swPath)) {
        const sw = fs
          .readFileSync(swPath, "utf8")
          .replaceAll(UI_BUILD_PLACEHOLDER, buildTag);
        fs.writeFileSync(swPath, sw);
      }
      console.log(`[clover-ui-build] ${buildTag}`);
    },
  };
}

function publicLocaleHtmlDelivery() {
  return {
    name: "clover-public-locale-html-delivery",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }
        const outDir = path.resolve(
          server.config.root,
          server.config.build.outDir
        );
        const requestPath = String(req.url || "/").split("?")[0];
        if (requestPath === "/public-route-manifest.json") {
          res.statusCode = 404;
          res.setHeader("Cache-Control", "no-store");
          res.end("Not found");
          return;
        }
        const manifestPath = path.join(outDir, "public-route-manifest.json");
        if (!fs.existsSync(manifestPath)) {
          next();
          return;
        }
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        } catch {
          next();
          return;
        }
        const resolution = resolvePublicRouteRequest(manifest, req.url || "/");
        if (resolution.action === "pass") {
          next();
          return;
        }
        if (resolution.action === "redirect") {
          res.statusCode = resolution.status;
          res.setHeader("Location", resolution.location);
          res.setHeader("Cache-Control", "public, max-age=300");
          res.end();
          return;
        }
        if (resolution.action === "error") {
          res.statusCode = resolution.status;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end("Not found");
          return;
        }
        const indexPath = path.join(outDir, "index.html");
        if (!fs.existsSync(indexPath)) {
          next();
          return;
        }
        const html = renderPublicRouteHtml(
          fs.readFileSync(indexPath, "utf8"),
          resolution.record,
          { indexable: resolution.indexable }
        );
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Content-Language", resolution.record.locale === "zh" ? "zh-CN" : resolution.record.locale);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Vary", "Accept-Encoding");
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(html);
      });
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
 * SPA fallback must NOT swallow missing static files as index.html —
 * phone then gets HTML as CSS/image → broken UI / false-positive 200 pages.
 * Applies to hashed /assets/* and bundled /storefront/* hero media.
 */
function noAssetSpaFallback() {
  return {
    name: "clover-no-asset-spa-fallback",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = String(req.url || "").split("?")[0];
        let relative = "";
        if (url.startsWith("/assets/")) {
          relative = url.replace(/^\/assets\//, "assets/");
        } else if (url.startsWith("/storefront/")) {
          relative = url.replace(/^\/storefront\//, "storefront/");
        } else {
          next();
          return;
        }
        const outDir = path.resolve(server.config.root, server.config.build.outDir);
        const filePath = path.resolve(outDir, relative);
        if (filePath !== outDir && !filePath.startsWith(`${outDir}${path.sep}`)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not found");
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
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
  plugins: [
    react(),
    cloverUiBuildTag(),
    publicLocaleHtmlDelivery(),
    noAssetSpaFallback(),
    cloverPreviewCacheHeaders(),
  ],
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
