import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { launchTestChromium } from "./playwrightRuntime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const fixtureRoot = path.join(
  scriptDir,
  "fixtures/client-checkout-address-picker"
);

const vite = await createServer({
  root: fixtureRoot,
  configFile: false,
  logLevel: "error",
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    fs: { allow: [repoRoot] },
  },
});

let browser;
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === "object", "Vite fixture must listen");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await launchTestChromium();

  const openMobileFixture = async (count) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?count=${count}`, { waitUntil: "networkidle" });
    await page.locator(".mobile-checkout-bar-button").click();
    await page.locator(".cart-sheet").waitFor({ state: "visible" });
    return { context, page };
  };

  {
    const { context, page } = await openMobileFixture(1);
    await page.locator(".save-order-button").click();
    await page.waitForFunction(() => window.__savedOrders.length === 1);
    const saved = await page.evaluate(() => window.__savedOrders[0]);
    assert.equal(saved.addressId, "address-1", "one address must auto-select");
    assert.equal(
      await page.locator(".address-picker-sheet").count(),
      0,
      "one address must not open a picker"
    );
    await context.close();
  }

  {
    const { context, page } = await openMobileFixture(2);
    await page.locator(".save-order-button").click();
    const dialog = page.locator(".address-picker-sheet");
    await dialog.waitFor({ state: "visible" });
    assert.equal(await page.locator(".address-picker-option").count(), 2);

    await page.locator(".address-picker-option").nth(1).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("address-picker-trigger")),
      true,
      "focus must return to the address trigger"
    );

    await page.locator(".address-picker-trigger").click();
    await dialog.waitFor({ state: "visible" });
    await page.locator(".delivery-date-sheet-head .header-button").focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("address-picker-option")),
      true,
      "Shift+Tab must wrap inside the dialog"
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });

    await page.locator(".address-picker-trigger").click();
    await page.locator(".address-picker-option").nth(1).click();
    await page.locator(".save-order-button").click();
    await page.waitForFunction(() => window.__savedOrders.length === 1);
    const saved = await page.evaluate(() => window.__savedOrders[0]);
    assert.equal(saved.addressId, "address-2", "explicit address id must reach onSave");
    assert.match(saved.address, /дом 2$/, "explicit address text must reach onSave");
    await context.close();
  }

  {
    const { context, page } = await openMobileFixture(12);
    await page.locator(".save-order-button").click();
    const list = page.locator(".address-picker-list");
    await list.waitFor({ state: "visible" });
    const metrics = await list.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    assert.ok(
      metrics.scrollHeight > metrics.clientHeight,
      "long mobile address list must be scrollable"
    );

    const box = await list.boundingBox();
    assert.ok(box, "address list must have a mobile bounding box");
    const cdp = await context.newCDPSession(page);
    for (let gesture = 0; gesture < 5; gesture += 1) {
      const x = box.x + box.width / 2;
      const startY = box.y + box.height - 24;
      const endY = box.y + 32;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y: startY }],
      });
      for (let step = 1; step <= 6; step += 1) {
        const y = startY + ((endY - startY) * step) / 6;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y }],
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    assert.ok(
      await list.evaluate((element) => element.scrollTop > 0),
      "touch swipe must move the mobile address list"
    );
    const last = page.locator(".address-picker-option").last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await page.locator(".save-order-button").click();
    await page.waitForFunction(() => window.__savedOrders.length === 1);
    assert.equal(
      await page.evaluate(() => window.__savedOrders[0].addressId),
      "address-12",
      "last scrolled address must be selectable"
    );
    await context.close();
  }

  console.log("Client checkout address picker browser verification passed.");
} finally {
  await browser?.close();
  await vite.close();
}
