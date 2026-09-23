import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';
import { resolvePublicRouteRequest } from '../../src/shared/sitemap/publicRouteHtml.js';
import { publicPathForLocale } from '../../src/shared/i18n/publicLocaleRouting.js';

const pairs = [
  ['/catalog/odnorazovaya-posuda/dlya-sushi-i-lapshi', '/catalog/Одноразовая посуда/Для суши и лапши'],
  ['/catalog/himiya-chistyashchie-sredstva/dlya-okon', '/catalog/Химия, чистящие средства/Для окон'],
];
const product = '/product/%D0%9D%D0%A4-00002829';
const routes = Object.fromEntries([...pairs.map(([, path]) => path), product, '/catalog'].map(path => {
  const target = publicPathForLocale(path, 'ru');
  return [target, { locale: 'ru', canonical: `https://clover-spb.ru${target}` }];
}));
const manifest = { infrastructureEnabled: true, enabledLanguages: ['ru'], routes };
for (const [source, path] of pairs) {
  const target = publicPathForLocale(path, 'ru');
  assert.deepEqual(resolvePublicRouteRequest(manifest, source), { action: 'redirect', status: 301, location: target });
  assert.equal(resolvePublicRouteRequest(manifest, source + '?utm_source=test').location, target + '?utm_source=test');
  assert.equal(resolvePublicRouteRequest(manifest, target).action, 'render');
  assert.equal(resolvePublicRouteRequest({ ...manifest, routes: {} }, source).status, 404);
  assert.equal(resolvePublicRouteRequest({ ...manifest, enabledLanguages: [] }, source).status, 404);
  assert.equal(resolvePublicRouteRequest(manifest, '/en' + source).status, 404);
  assert.notEqual(resolvePublicRouteRequest(manifest, source + '/extra').action, 'redirect');
  assert.equal(resolvePublicRouteRequest({ ...manifest, infrastructureEnabled: false }, source).action, 'pass');
  assert.equal(resolvePublicRouteRequest({ ...manifest, routes: { ...routes, [source]: routes[target] } }, source).status, 200);
}
for (const source of [product, '/catalog']) {
  const result = resolvePublicRouteRequest(manifest, source);
  assert.equal(result.action, 'render');
  assert.equal(result.status, 200);
  assert.equal(result.record.canonical, `https://clover-spb.ru${publicPathForLocale(source, 'ru')}`);
}
assert.equal(resolvePublicRouteRequest(manifest, '/catalog/nonexistent').status, 404);
assert.equal(resolvePublicRouteRequest(manifest, '/catalog/%ZZ').status, 400);
assert.equal(resolvePublicRouteRequest(manifest, '/api/health').action, 'pass');
console.log('Legacy category redirect regression checks passed');

// Exercise the real Vite preview middleware with an isolated published manifest.
const fixture = mkdtempSync(path.join(os.tmpdir(), 'clover-legacy-redirects-'));
writeFileSync(path.join(fixture, 'index.html'), '<html><head></head><body></body></html>');
writeFileSync(path.join(fixture, 'public-route-manifest.json'), JSON.stringify(manifest));
const server = await preview({ build: { outDir: fixture }, preview: { host: '127.0.0.1', port: 0, open: false } });
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [source, targetPath] of pairs) {
    const target = publicPathForLocale(targetPath, 'ru');
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(origin + source, { method, redirect: 'manual' });
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), target);
      await response.arrayBuffer();
      const destination = await fetch(origin + target, { method, redirect: 'manual' });
      assert.equal(destination.status, 200);
      await destination.arrayBuffer();
    }
  }
  console.log('Vite preview GET/HEAD: both 301 redirects and destination 200 passed');
} finally {
  await new Promise(resolve => server.httpServer.close(resolve));
  console.log(`Isolated fixture retained: ${fixture}`);
}
