import path from "node:path";
import { pathToFileURL } from "node:url";

import { renderPublicRouteHtml } from "../../src/shared/sitemap/publicRouteHtml.js";
import {
  JSONLD_HTML_EMBED_CASES,
  closeJsonLdHtmlEmbedBrowser,
  expectSafeJsonLdEmbed,
  inspectJsonLdHtmlEmbed,
  inspectJsonLdHtmlEmbedInBrowser,
} from "./jsonLdHtmlEmbed.mjs";

export const JSONLD_EMBED_BASE_HTML = `<!doctype html>
<html lang="ru">
  <head>
    <script>
      window.__CLOVER_JSONLD_BREAKOUT = window.__CLOVER_JSONLD_BREAKOUT || 0;
    </script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"КЛЕВЕР","url":"https://clover-spb.ru/","logo":"https://clover-spb.ru/apple-touch-icon.png","description":"base"}</script>
  </head>
  <body><div id="root"></div></body>
</html>
`;

function organizationRecord(description, locale = "uz") {
  return {
    title: "UZ Home",
    description,
    type: "website",
    ogLocale: "uz_UZ",
    locale,
    direction: "ltr",
    canonical: "https://clover-spb.ru/uz/",
    alternates: [],
    organizationDescription: description,
  };
}

export function renderJsonLdEmbedCases(baseHtml = JSONLD_EMBED_BASE_HTML) {
  return JSONLD_HTML_EMBED_CASES.map((item) => ({
    ...item,
    html: renderPublicRouteHtml(baseHtml, organizationRecord(item.description)),
  }));
}

export async function assertJsonLdHtmlEmbedCases(rendered, { httpHtml = "", httpExpectedId = "script-close" } = {}) {
  const failures = [];
  for (const item of rendered) {
    const htmlParser = inspectJsonLdHtmlEmbed(item.html);
    const htmlFailures = expectSafeJsonLdEmbed(htmlParser, item, `${item.id}/html5`);
    failures.push(...htmlFailures);
    if (htmlFailures.length) {
      console.error(
        JSON.stringify({
          phase: "html5",
          id: item.id,
          jsonLdCount: htmlParser.jsonLdCount,
          breakoutScriptCount: htmlParser.breakoutScriptCount,
          parseError: htmlParser.parseError,
          extraHtmlFromPayload: htmlParser.extraHtmlFromPayload,
        })
      );
    }
    const dom = await inspectJsonLdHtmlEmbedInBrowser(item.html);
    const domFailures = expectSafeJsonLdEmbed(dom, item, `${item.id}/dom`);
    failures.push(...domFailures);
    if (domFailures.length) {
      console.error(
        JSON.stringify({
          phase: "dom",
          id: item.id,
          jsonLdCount: dom.jsonLdCount,
          breakoutNodeCount: dom.breakoutNodeCount,
          breakoutNodeNames: dom.breakoutNodeNames,
          extraPayloadElementCount: dom.extraPayloadElementCount,
          extraPayloadTags: dom.extraPayloadTags,
          markerExecuted: dom.markerExecuted,
          parseError: dom.parseError,
        })
      );
    }
  }
  if (httpHtml) {
    const expected = JSONLD_HTML_EMBED_CASES.find((item) => item.id === httpExpectedId);
    const htmlParser = inspectJsonLdHtmlEmbed(httpHtml);
    failures.push(...expectSafeJsonLdEmbed(htmlParser, expected, "http/html5"));
    const dom = await inspectJsonLdHtmlEmbedInBrowser(httpHtml);
    failures.push(...expectSafeJsonLdEmbed(dom, expected, "http/dom"));
  }
  return failures;
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const rendered = renderJsonLdEmbedCases();
  try {
    const failures = await assertJsonLdHtmlEmbedCases(rendered);
    if (failures.length) {
      console.error("STAGE_7_JSONLD_HTML_EMBED=FAIL");
      for (const failure of failures) console.error(failure);
      process.exitCode = 1;
    } else {
      console.log("STAGE_7_JSONLD_HTML_EMBED=PASS");
      console.log(`cases=${rendered.length}`);
    }
  } finally {
    await closeJsonLdHtmlEmbedBrowser();
  }
}
