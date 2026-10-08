import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createDocumentsRouter } from '../src/documents/router.js';

async function fixture(t, adapters = {}, enabled = true) {
  const actors = { admin: { id: 'admin', role: 'admin' }, client: { id: 'client', role: 'client' }, disabled: { id: 'disabled', role: 'admin', disabled_at: '2026-10-07' } };
  const app = express(); app.use(express.json());
  app.use('/documents', createDocumentsRouter({ enabled, verificationAdapters: adapters,
    repository: { listLegalEntities: () => [], getSequence: () => null },
    authRequired: (req, res, next) => { req.user = actors[req.headers['x-test-actor']]; return req.user ? next() : res.sendStatus(401); },
  }));
  const server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  t.after(() => server.close());
  return async (body, actor = 'admin', path = '/admin/generator/verify-counterparty') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/documents${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'x-test-actor': actor, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: response.status === 401 ? null : await response.json() };
  };
}
const counterparty = { type: 'ooo', inn: '7707083893', fullName: 'Карточка клиента' };

test('external verification is admin-only, disabled runtime performs no lookup', async t => {
  let calls = 0; const adapter = async () => { calls++; return { status: 'ambiguous' }; };
  const call = await fixture(t, { fns: adapter });
  for (const actor of ['client', 'disabled', 'unknown']) assert.ok([401, 403].includes((await call({ counterparty }, actor)).status));
  assert.equal(calls, 0);
  const disabled = await fixture(t, { fns: adapter }, false);
  assert.equal((await disabled({ counterparty })).status, 503); assert.equal(calls, 0);
});

test('caller cannot supply URLs, provider data or unsupported fields', async t => {
  let calls = 0; const call = await fixture(t, { fns: async () => { calls++; return { status: 'ambiguous' }; } });
  for (const body of [{ counterparty, url: 'https://egrul.nalog.ru/' }, { counterparty, verificationAdapters: {} }, { counterparty: { ...counterparty, sourceUrl: 'https://egrul.nalog.ru/' } }]) {
    assert.equal((await call(body)).status, 400);
  }
  assert.equal(calls, 0);
});

test('unconfigured lookup reports not checked without billing, database or green result', async t => {
  const call = await fixture(t);
  const options = await call(undefined, 'admin', '/admin/generator/options');
  assert.equal(options.body.verification.configured, false); assert.equal(options.body.verification.required, false);
  const report = await call({ counterparty });
  assert.equal(report.status, 200); assert.equal(report.body.status, 'unavailable');
  assert.equal(report.body.sources.length, 4); assert.ok(report.body.sources.every(source => source.status === 'not_configured'));
  assert.equal(report.body.sources.find(source => source.id === 'bankruptcy').status, 'not_configured');
  assert.deepEqual(report.body.comparisons, []);
});

test('trusted adapter receives only INN and type; ambiguous report cannot fill facts', async t => {
  let input; const call = await fixture(t, { fns: async value => { input = value; return { status: 'ambiguous' }; } });
  const options = await call(undefined, 'admin', '/admin/generator/options'); assert.equal(options.body.verification.configured, true);
  const report = await call({ counterparty: { ...counterparty, phone: '+7 (977) 777-77-77', email: 'client@example.invalid' } });
  assert.deepEqual(input, { inn: counterparty.inn, type: counterparty.type });
  assert.equal(report.body.sources[0].status, 'ambiguous'); assert.equal(report.body.sources.find(source => source.id === 'bankruptcy').status, 'not_configured');
  assert.deepEqual(report.body.comparisons, []);
});
