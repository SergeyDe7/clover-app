import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function attachForwardedOrigin(proxyReq, req) {
  const host = req.headers.host;
  if (host) {
    proxyReq.setHeader("X-Forwarded-Host", host);
    proxyReq.setHeader("X-Forwarded-Proto", req.headers["x-forwarded-proto"] || "http");
  }
}

const proxy = {
  "/api": {
    target: "http://127.0.0.1:4100",
    changeOrigin: true,
    configure(proxyServer) {
      proxyServer.on("proxyReq", attachForwardedOrigin);
    },
  },
  "/uploads": {
    target: "http://127.0.0.1:4100",
    changeOrigin: true,
    configure(proxyServer) {
      proxyServer.on("proxyReq", attachForwardedOrigin);
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5273,
    strictPort: true,
    proxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 5273,
    strictPort: true,
    proxy,
  },
});
