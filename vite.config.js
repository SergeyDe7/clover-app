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
  plugins: [react(), noAssetSpaFallback()],
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
