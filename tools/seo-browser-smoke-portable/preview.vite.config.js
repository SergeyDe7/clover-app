import { mergeConfig } from "vite";
import base from "../../vite.config.js";

const apiOrigin = String(process.env.CLOVER_SEO_API_ORIGIN || "").trim();
const preview = {
  host: process.env.CLOVER_SEO_PREVIEW_HOST || "127.0.0.1",
  strictPort: true,
  allowedHosts: true,
};
if (apiOrigin) {
  preview.proxy = {
    "/api": { target: apiOrigin, changeOrigin: true },
    "/uploads": { target: apiOrigin, changeOrigin: true },
  };
}

export default mergeConfig(base, { preview });
