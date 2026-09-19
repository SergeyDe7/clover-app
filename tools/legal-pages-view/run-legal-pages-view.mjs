#!/usr/bin/env node
/**
 * Isolated React preview of legal pages. Metrika OFF. No live DB, no orders.
 * Static HTML in pages/ is not this check.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STOREFRONT_INFO_PAGES } from "../../src/screens/storefront/pages/infoPages.js";
import { getInfoPageBodyBlocks } from "../../server/src/i18n/infoPageBodyTranslationSeed.js";
import { getInfoPageSeedTranslation } from "../../server/src/i18n/infoPageTranslationSeed.js";
import { SEEDS as UI_SEEDS } from "../../server/src/i18n/uiTranslationSeed.js";

const portableDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(portableDir, "../..");
const liveRoot = "/opt/clover/clover-app";
const ENABLED_LANGS = ["ru", "en", "uz", "ky", "tg", "zh", "ar"];

function findVite() {
  const local = path.join(root, "node_modules/vite/bin/vite.js");
  const shared = path.join(liveRoot, "node_modules/vite/bin/vite.js");
  if (existsSync(local)) return local;
  if (existsSync(shared)) return shared;
  throw new Error("vite not found. Run npm ci in the unpacked candidate first.");
}

function findBrowser() {
  const named = String(process.env.CLOVER_BROWSER_CHROME || "").trim();
  const win = process.platform === "win32";
  const candidates = [
    named,
    win && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
      : "",
    win && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe")
      : "",
  ].filter(Boolean);
  return candidates.find((file) => existsSync(file)) || "";
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".woff2": "font/woff2",
    }[ext] || "application/octet-stream"
  );
}

function safeJoin(base, urlPath) {
  const rel = decodeURIComponent(String(urlPath || "/").split("?")[0]).replace(/^\/+/, "");
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(path.normalize(base))) return null;
  return full;
}

function seedDictionary(locale) {
  const dict = {};
  for (const [key, langs] of Object.entries(UI_SEEDS)) {
    if (langs && typeof langs[locale] === "string") dict[key] = langs[locale];
  }
  return dict;
}

function projectedInfoPages(locale) {
  const out = {};
  for (const page of STOREFRONT_INFO_PAGES) {
    const blocks =
      locale === "ru" ? null : getInfoPageBodyBlocks(page.slug, locale === "zh" ? "zh-CN" : locale);
    out[page.slug] = {
      heading: getInfoPageSeedTranslation(page.slug, "heading", locale === "zh" ? "zh-CN" : locale) || page.heading,
      title: getInfoPageSeedTranslation(page.slug, "title", locale === "zh" ? "zh-CN" : locale) || page.title,
      description:
        getInfoPageSeedTranslation(page.slug, "description", locale === "zh" ? "zh-CN" : locale) ||
        page.description,
      blocks: blocks || undefined,
    };
    if (locale === "ru") delete out[page.slug].blocks;
  }
  return out;
}

function bootHtml(origin) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Legal React view</title>
</head>
<body style="font-family:system-ui;padding:16px;max-width:720px">
  <p>Настоящие React-страницы isolated preview. Метрика выключена. Заказы не отправлять. Статичный HTML не заменяет этот просмотр.</p>
  <p>Корзина и язык выставляются кнопками ниже, затем откройте страницу в этом же профиле.</p>
  <p>
    <button type="button" id="ru">RU + корзина</button>
    <button type="button" id="ar">AR + корзина</button>
  </p>
  <ul>
    <li><a href="${origin}/privacy-policy">/privacy-policy</a></li>
    <li><a href="${origin}/personal-data-consent">/personal-data-consent</a></li>
    <li><a href="${origin}/checkout">/checkout</a> (после «RU + корзина»)</li>
    <li><a href="${origin}/ar/privacy-policy">/ar/privacy-policy</a></li>
    <li><a href="${origin}/ar/personal-data-consent">/ar/personal-data-consent</a></li>
    <li><a href="${origin}/checkout">/checkout</a> (после «AR + корзина»)</li>
  </ul>
  <p>Ширины: 390 и 1280. Чеклист: НК РФ 5 лет не 4; учётные документы отдельно от остальных данных; нет оговорки «независимая проверка дата-центра»; Метрика не обещает удаление после отзыва.</p>
  <script>
    const cart = [{productId:"legal-view",code:"LEGAL",name:"Просмотр",unit:"шт",price:100,qty:1,orderStep:1,unitSize:1}];
    function seed(lang) {
      localStorage.setItem("clover-storefront-cart-v1", JSON.stringify(cart));
      localStorage.setItem("clover-language-preference-v1", lang);
      sessionStorage.setItem("clover-language-explicit-v1", lang);
    }
    document.getElementById("ru").onclick = () => seed("ru");
    document.getElementById("ar").onclick = () => seed("ar");
  </script>
</body>
</html>`;
}

function buildOffDist(outDir) {
  const viteBin = findVite();
  if (path.resolve(root) === path.resolve(liveRoot)) {
    throw new Error("refusing to build inside live clover-app");
  }
  mkdirSync(outDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [viteBin, "build", "--outDir", outDir, "--emptyOutDir"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        VITE_STORE_HOSTS: "127.0.0.1,localhost",
        VITE_PUBLIC_BASE_URL: "https://clover-spb.ru",
        CLOVER_PUBLIC_LOCALE_ROUTES_ENABLED: "1",
        VITE_YANDEX_METRIKA_ENABLED: "",
        VITE_YANDEX_METRIKA_TEST_MODE: "",
        NODE_PATH: [
          path.join(root, "node_modules"),
          existsSync(path.join(liveRoot, "node_modules"))
            ? path.join(liveRoot, "node_modules")
            : "",
          process.env.NODE_PATH || "",
        ]
          .filter(Boolean)
          .join(path.delimiter),
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(`vite build failed\n${result.stderr}\n${result.stdout}`);
  }
}

function startServer(distDir) {
  const dict = {
    ar: seedDictionary("ar"),
    en: seedDictionary("en"),
    "zh-CN": seedDictionary("zh-CN"),
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/__legal-view") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(bootHtml(`http://127.0.0.1:${server.address().port}`));
      return;
    }
    if (url.pathname === "/api/public/localization/runtime") {
      const requested = url.searchParams.get("language") || "ru";
      const effective = requested === "zh" ? "zh-CN" : requested;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          catalogVersion: 1,
          dictionary: dict[effective] || {},
          effectiveLocale: effective,
          enabledLanguages: ENABLED_LANGS,
        })
      );
      return;
    }
    if (url.pathname === "/api/public/site") {
      const requested = url.searchParams.get("language") || "ru";
      const locale = requested === "zh-CN" ? "zh" : requested;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          site: {
            infoPages: projectedInfoPages(locale === "zh" ? "zh-CN" : locale),
            categories: [],
            locale,
          },
        })
      );
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(url.pathname.startsWith("/api/public/catalog") ? JSON.stringify({ products: [], categories: [] }) : "{}");
      return;
    }
    let file = safeJoin(distDir, url.pathname);
    if (file && existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      if (path.extname(url.pathname)) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not-found");
        return;
      }
      file = path.join(distDir, "index.html");
    }
    res.writeHead(200, { "content-type": mimeFor(file) });
    res.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
    server.on("error", reject);
  });
}

const keepOpen = process.argv.includes("--keep-open") || process.platform === "win32";
const work = mkdtempSync(path.join(tmpdir(), "clover-legal-react-"));
const distDir = path.join(work, "dist-off");
buildOffDist(distDir);
const preview = await startServer(distDir);
const pages = [
  "/privacy-policy",
  "/personal-data-consent",
  "/checkout",
  "/ar/privacy-policy",
  "/ar/personal-data-consent",
];
const report = {
  LEGAL_PAGES_VIEW: "PREPARED",
  package: "tools/legal-pages-view",
  origin: preview.origin,
  boot: `${preview.origin}/__legal-view`,
  pages: pages.map((p) => `${preview.origin}${p}`),
  viewports: [390, 1280],
  metrika: "off",
  note: "React SPA. Static pages/ HTML is not this check.",
};
writeFileSync(path.join(portableDir, "LEGAL_PAGES_VIEW.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

const browser = findBrowser();
if (browser) {
  for (const width of [390, 1280]) {
    spawn(browser, ["--new-window", `--window-size=${width},${width === 390 ? 844 : 900}`, `${preview.origin}/__legal-view`], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
} else {
  console.log("LEGAL_PAGES_VIEW: browser not opened here. Use Windows Chrome on the boot URL.");
}

if (!keepOpen) {
  await preview.close();
} else {
  console.log("Server kept open for Windows viewing. Ctrl+C to stop.");
}
