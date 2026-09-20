import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "./readFrontendUiSource.mjs";

const boot = readFileSync(path.join(projectRoot, "src/main.jsx"), "utf8");
const html = readFileSync(path.join(projectRoot, "index.html"), "utf8");

const minimumMatch = boot.match(/const BOOT_SPLASH_MS = (\d+);/);
assert.ok(minimumMatch, "В main.jsx должен быть явный минимум показа boot splash.");

const minimumMs = Number(minimumMatch[1]);
assert.ok(
  minimumMs >= 1000,
  `Логотип iPhone PWA должен быть видим не меньше 1000 мс, сейчас ${minimumMs} мс.`
);

const animationMatch = html.match(
  /animation:\s*clover-boot-logo-in\s+([\d.]+)s\s+ease-out\s+both/
);
assert.ok(animationMatch, "Анимация появления логотипа должна оставаться явной.");
assert.ok(
  Number(animationMatch[1]) * 1000 < minimumMs,
  "Минимальный показ splash должен быть дольше анимации появления логотипа."
);

const observerMatch = boot.match(
  /const splashObserver = new MutationObserver\(\(\) => \{([\s\S]*?)\n\s*\}\);/
);
assert.ok(observerMatch, "Нужен observer, который снимает splash после рендера приложения.");
assert.match(
  observerMatch[1],
  /scheduleBootSplashHide\(bootStartedAt\)/,
  "Быстрый React render должен ждать минимальное время показа splash."
);
assert.doesNotMatch(
  observerMatch[1],
  /\bhideBootSplash\(\)/,
  "Observer не должен скрывать splash немедленно на тёплом PWA-кэше."
);

assert.match(
  html,
  /<div id="clover-boot-splash"[\s\S]*?<img src="\/clover-logo\.png"/,
  "Boot splash должен использовать логотип Clover."
);
assert.match(
  html,
  /@media \(max-width: 900px\), \(display-mode: standalone\), \(display-mode: fullscreen\)/,
  "Splash должен включаться на телефоне и в установленной PWA."
);

console.log("verify-iphone-boot-splash: ok");
