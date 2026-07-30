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
