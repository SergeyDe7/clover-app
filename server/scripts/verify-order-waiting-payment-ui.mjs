import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchTestChromium } from './playwrightRuntime.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = path.join(root, 'server/scripts/fixtures/order-waiting-payment-ui');
const out = path.join(root, 'output/order-waiting-payment-ui');
mkdirSync(out, {recursive:true});
const server = await createServer({root:harness, configFile:path.join(harness,'vite.config.js')});
await server.listen();
const origin = server.resolvedUrls.local[0];
let browser;
const results = [];
try {
 browser = await launchTestChromium({headless:true});
 for (const width of [1440,390,360]) for (const role of ['client','manager','admin']) {
  const page = await browser.newPage({viewport:{width,height:1000}});
  const errors=[]; const blocked=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/*', route=> {
   const url=new URL(route.request().url());
   if (url.origin !== new URL(origin).origin || url.pathname.startsWith('/api/')) {
    blocked.push(url.href);
    return route.fulfill({status:200,contentType:'application/json',body:'{"exchangeContour":{"prodEnabled":false,"allowedDatabases":["TEST"],"defaultDatabase":"TEST"},"items":[]}'});
   }
   return route.continue();
  });
  try {
   await page.goto(`${origin}?${role==='client'?'order=fixture-order':`role=${role}`}`);
   const card=page.locator('.order-card').first(); await card.waitFor();
   if(role==='client') {
    await assert.equal(await card.locator('.badge').first().innerText(),'Ожидание оплаты');
    await card.locator('summary').click();
    assert(await card.getByText('Тестовый товар',{exact:true}).isVisible());
    assert.equal(await card.getByRole('button',{name:/Редактировать|Изменить|Дозаказ|Дополнить/}).count(),0);
    assert(await card.locator('.badge').first().isVisible());
   } else {
    const select=card.locator('.manager-order-status-select');
    assert.equal(await select.inputValue(),'Ожидание оплаты');
    assert.equal(await select.locator('option[value="Ожидание оплаты"]').innerText(),'Ожидание оплаты');
    await select.selectOption('Принят');
    assert.deepEqual(await page.evaluate(()=>window.__updates),[{id:'fixture-order',patch:{status:'Принят'}}]);
    await select.selectOption('Ожидание оплаты');
    assert.equal(await page.evaluate(()=>window.__updates.length),1);
   }
   const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert(layout.scroll<=layout.viewport+1,JSON.stringify(layout));
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,`${role}-${width}.png`),fullPage:true});
   results.push({status:'PASS',role,width,layout,blocked,checks:'real component status; client details/no edit; staff dropdown callback; no horizontal overflow'});
  } catch(e) {results.push({status:'FAIL',role,width,error:e.stack,errors,blocked}); await page.screenshot({path:path.join(out,`${role}-${width}-fail.png`),fullPage:true});}
  await page.close();
 }
} finally {await browser?.close(); await server.close();writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results,null,2));
assert(results.every(x=>x.status==='PASS'),'UI cases failed; inspect output/order-waiting-payment-ui/results.json');


