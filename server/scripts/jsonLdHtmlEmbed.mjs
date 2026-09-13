import { pathToFileURL } from "node:url";
import path from "node:path";

export const JSONLD_HTML_EMBED_MARKER = "clover-jsonld-breakout-marker";

export const JSONLD_HTML_EMBED_CASES = Object.freeze([
  Object.freeze({
    id: "script-close",
    description: `Ordinary UZ copy </script><script data-clover-jsonld-breakout="${JSONLD_HTML_EMBED_MARKER}">window.__CLOVER_JSONLD_BREAKOUT=1;</script> trailing`,
  }),
  Object.freeze({
    id: "script-close-mixed",
    description: `Ordinary UZ copy </Script><script data-clover-jsonld-breakout="${JSONLD_HTML_EMBED_MARKER}">window.__CLOVER_JSONLD_BREAKOUT=1;</script> trailing`,
  }),
  Object.freeze({
    id: "html-comment",
    description: `Hello <!-- not-a-comment <b>bold</b> --> world`,
  }),
  Object.freeze({
    id: "quotes-amp-newline-unicode",
    description: `Say "hi" & 'bye'\nПривет 你好`,
  }),
  Object.freeze({
    id: "plain",
    description: "Ordinary organization description",
  }),
]);

const playwrightRoot =
  process.env.PLAYWRIGHT_MODULE_ROOT ||
  "/opt/clover/.npm/_npx/e41f203b7505f1fb/node_modules/playwright";
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ||
  "/opt/clover/.cache/ms-playwright/chromium-1148/chrome-linux/chrome";
const chromeLibs =
  process.env.PLAYWRIGHT_CHROME_LIBS ||
  "/opt/clover/.tmp/chrome-libs/usr/lib/x86_64-linux-gnu";

/**
 * HTML5 script data end-tag: after `<script>`, consume until `</script`
 * (ASCII case-insensitive) followed by space, tab, LF, FF, CR, `/`, or `>`.
 */
export function parseHtmlScriptElements(html) {
  const source = String(html);
  const scripts = [];
  const openRe = /<script\b([^>]*)>/gi;
  let searchFrom = 0;
  let match;
  while ((match = openRe.exec(source))) {
    if (match.index < searchFrom) continue;
    const attrs = match[1] || "";
    const dataStart = match.index + match[0].length;
    const rest = source.slice(dataStart);
    const end = rest.match(/<\/script(?=[\s\/>])/i);
    if (!end) {
      scripts.push({
        attrs,
        text: rest,
        closed: false,
        start: match.index,
        type: scriptType(attrs),
      });
      break;
    }
    const closeStart = dataStart + end.index;
    const closeMatch = source.slice(closeStart).match(/^<\/script\b[^>]*>/i);
    const closeLen = closeMatch ? closeMatch[0].length : 9;
    scripts.push({
      attrs,
      text: rest.slice(0, end.index),
      closed: true,
      start: match.index,
      type: scriptType(attrs),
    });
    searchFrom = closeStart + closeLen;
    openRe.lastIndex = searchFrom;
  }
  return scripts;
}

function scriptType(attrs) {
  const match = String(attrs).match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

export function inspectJsonLdHtmlEmbed(html) {
  const scripts = parseHtmlScriptElements(html);
  const jsonLd = scripts.filter((item) => item.type === "application/ld+json");
  const breakoutScripts = scripts.filter((item) =>
    /data-clover-jsonld-breakout/i.test(item.attrs)
  );
  let parsed = null;
  let parseError = "";
  if (jsonLd.length === 1) {
    try {
      parsed = JSON.parse(jsonLd[0].text);
    } catch (error) {
      parseError = String(error?.message || error);
    }
  }
  return {
    scriptCount: scripts.length,
    jsonLdCount: jsonLd.length,
    breakoutScriptCount: breakoutScripts.length,
    extraHtmlFromPayload: /data-clover-jsonld-breakout/i.test(html) && breakoutScripts.length > 0,
    parsed,
    parseError,
    jsonLdText: jsonLd[0]?.text || "",
  };
}

let sharedBrowser = null;

async function getBrowser() {
  if (sharedBrowser) return sharedBrowser;
  const { chromium } = await import(
    pathToFileURL(path.join(playwrightRoot, "index.mjs")).href
  );
  sharedBrowser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [chromeLibs, process.env.LD_LIBRARY_PATH || ""]
        .filter(Boolean)
        .join(":"),
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    },
  });
  return sharedBrowser;
}

export async function closeJsonLdHtmlEmbedBrowser() {
  if (!sharedBrowser) return;
  const browser = sharedBrowser;
  sharedBrowser = null;
  await browser.close();
}

export async function inspectJsonLdHtmlEmbedInBrowser(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(String(html), { waitUntil: "domcontentloaded" });
    return await page.evaluate((marker) => {
      const scripts = [...document.querySelectorAll("script")].map((node) => ({
        type: node.type,
        text: node.textContent || "",
        breakout: node.getAttribute("data-clover-jsonld-breakout") || "",
        childElementCount: node.childElementCount,
      }));
      const jsonLd = scripts.filter((item) => item.type === "application/ld+json");
      const breakoutNodes = [
        ...document.querySelectorAll("[data-clover-jsonld-breakout]"),
      ];
      const extraElements = [...document.body.querySelectorAll("*")].filter(
        (node) =>
          node.getAttribute("data-clover-jsonld-breakout") === marker ||
          node.tagName === "B"
      );
      let parsed = null;
      let parseError = "";
      if (jsonLd.length === 1) {
        try {
          parsed = JSON.parse(jsonLd[0].text);
        } catch (error) {
          parseError = String(error?.message || error);
        }
      }
      return {
        scriptCount: scripts.length,
        jsonLdCount: jsonLd.length,
        jsonLdText: jsonLd[0]?.text || "",
        parsed,
        parseError,
        breakoutNodeCount: breakoutNodes.length,
        breakoutNodeNames: breakoutNodes.map((node) => node.tagName),
        extraPayloadElementCount: extraElements.length,
        extraPayloadTags: extraElements.map((node) => node.tagName),
        markerExecuted: window.__CLOVER_JSONLD_BREAKOUT === 1,
        documentElementChildCount: document.documentElement.childElementCount,
      };
    }, JSONLD_HTML_EMBED_MARKER);
  } finally {
    await page.close();
  }
}

export function expectSafeJsonLdEmbed(inspection, expected, label) {
  const failures = [];
  if (inspection.jsonLdCount !== 1) {
    failures.push(`${label}: expected 1 JSON-LD script, got ${inspection.jsonLdCount}`);
  }
  if (inspection.breakoutScriptCount > 0 || inspection.breakoutNodeCount > 0) {
    failures.push(`${label}: payload created extra HTML/script nodes`);
  }
  if (inspection.extraPayloadElementCount > 0) {
    failures.push(
      `${label}: payload created extra elements ${inspection.extraPayloadTags?.join(",")}`
    );
  }
  if (inspection.markerExecuted) {
    failures.push(`${label}: harmless marker script executed`);
  }
  if (inspection.parseError) {
    failures.push(`${label}: JSON.parse failed: ${inspection.parseError}`);
  }
  const data = inspection.parsed;
  if (!data) {
    failures.push(`${label}: missing parsed JSON-LD`);
  } else {
    if (data["@type"] !== "Organization") {
      failures.push(`${label}: @type changed`);
    }
    if (data.name !== "КЛЕВЕР") failures.push(`${label}: name changed`);
    if (data.logo !== "https://clover-spb.ru/apple-touch-icon.png") {
      failures.push(`${label}: logo changed`);
    }
    if (data.url !== "https://clover-spb.ru/ru/") {
      failures.push(`${label}: url changed`);
    }
    if (data.description !== expected.description) {
      failures.push(`${label}: description was not preserved`);
    }
  }
  return failures;
}
