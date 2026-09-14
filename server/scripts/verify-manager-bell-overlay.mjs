/**
 * Structural check: notification panel must portal above chrome stacking.
 * Does not touch production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(
  path.join(root, "src/screens/manager/ManagerNotifications.jsx"),
  "utf8"
);
const helpersCss = readFileSync(
  path.join(root, "src/shared/appHelpers.js"),
  "utf8"
);
const themeCss = readFileSync(
  path.join(root, "src/styles/clover-theme.css"),
  "utf8"
);

assert.match(src, /createPortal/);
assert.match(src, /manager-bell-panel--portal/);
assert.match(src, /manager-bell-backdrop/);
assert.match(src, /Escape/);
assert.match(src, /aria-modal="true"/);
assert.match(src, /queueMicrotask/);
assert.match(src, /triggerRef\.current\?\.focus/);
assert.match(src, /app-modal-shell/);
assert.match(src, /max-width:\s*820px/);
// Backdrop closes via document pointerdown only — onClick would double-toggle.
assert.doesNotMatch(
  src,
  /className="manager-bell-backdrop"[\s\S]{0,120}onClick=\{close\}/
);

assert.match(helpersCss, /manager-bell-backdrop/);
assert.match(helpersCss, /z-index:\s*220/);
assert.match(helpersCss, /z-index:\s*219/);

assert.match(themeCss, /manager-bell-panel--portal/);
assert.doesNotMatch(
  themeCss,
  /\.clover-app \.manager-bell-panel \{[^}]*z-index:\s*90\s*!important/
);

console.log("verify-manager-bell-overlay: ok");
