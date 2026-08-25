/** UI build tag: placeholder в index.html, авто-инъекция в vite build, reload при смене. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexSource = readFileSync(path.join(root, "index.html"), "utf8");
const viteConfig = readFileSync(path.join(root, "vite.config.js"), "utf8");
const mainSource = readFileSync(path.join(root, "src/main.jsx"), "utf8");
const restartScript = readFileSync(path.join(root, "scripts/linux/restart-api-ui.sh"), "utf8");

assert.ok(indexSource.includes('name="clover-ui-build" content="%CLOVER_UI_BUILD%"'));
assert.ok(indexSource.includes("clover-ui-reloading"));
assert.ok(indexSource.includes("location.reload()"));
assert.ok(viteConfig.includes("cloverUiBuildTag"));
assert.ok(viteConfig.includes("cloverPreviewCacheHeaders"));
assert.ok(mainSource.includes('meta[name="clover-ui-build"]'));
assert.ok(mainSource.includes("clover-ui-reloading"));
assert.ok(restartScript.includes("npm run build"));
assert.ok(restartScript.includes("BUILD_TAG"));

console.log("verify-ui-build-tag: ok");
