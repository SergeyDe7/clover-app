import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { canAutomaticallyVerify, verificationFingerprint, applyEmptyRegistryProposals, applyRegistryChoice } from '../../src/shared/contracts/verificationSnapshot.js';
import { compareRegistryFacts } from '../../src/shared/contracts/externalVerification.js';

const fields = { type: 'ip', inn: '470422791518', fullName: 'ИП БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ', ogrnip: '' };
const ready = { configured: true, busy: '', alternativeRequired: false, fields, epoch: 1, alive: true };
const ticket = { epoch: 1, fingerprint: verificationFingerprint(fields) };
const report = { sources: [{ id: 'fns', status: 'partial', checkedFields: ['inn', 'ogrnip'], missingFields: ['legalAddress'], sourceUrl: 'https://egrul.nalog.ru/index.html', checkedAt: '2026-10-07T10:00:00Z' }], comparisons: [{ sourceId: 'fns', field: 'ogrnip', status: 'proposal', registry: '326470400103966' }, { sourceId: 'fns', field: 'legalAddress', status: 'proposal', registry: 'НЕ ПОДТВЕРЖДЁН' }] };

test('recognition waits for AI, configured adapter, valid INN and selected card; edits/reset/unmount cancel', () => {
  assert.equal(canAutomaticallyVerify(ticket, ready), true);
  for (const change of [{ configured: false }, { busy: 'AI' }, { alternativeRequired: true }, { epoch: 2 }, { alive: false }, { fields: { ...fields, inn: '1' } }, { fields: { ...fields, fullName: 'Правка' } }]) assert.equal(canAutomaticallyVerify(ticket, { ...ready, ...change }), false);
  assert.equal(canAutomaticallyVerify(null, ready), false);
});

test('partial proposals never fill unconfirmed address; conflict requires explicit choice', () => {
  const result = applyEmptyRegistryProposals(fields, report, ticket.fingerprint);
  assert.equal(result.fields.ogrnip, '326470400103966');
  assert.equal(result.fields.legalAddress, undefined);
  assert.equal(canAutomaticallyVerify(ticket, { ...ready, fields: result.fields }), false);
  const conflicts = { ...report, comparisons: [{ sourceId: 'fns', field: 'inn', status: 'choice', original: fields.inn, registry: '123456789012' }, { sourceId: 'fns', field: 'legalAddress', status: 'choice', original: '', registry: 'НЕ ПОДТВЕРЖДЁН' }] };
  assert.equal(applyRegistryChoice(fields, conflicts, ticket.fingerprint, 'legalAddress', 'registry'), null);
  assert.equal(applyRegistryChoice(fields, conflicts, ticket.fingerprint, 'inn', 'original').inn, fields.inn);
});

test('late response cannot autofill a manually edited card', async () => {
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const current = { ...fields, fullName: 'Ручная правка' };
  resolve(report);
  const result = applyEmptyRegistryProposals(current, await response, ticket.fingerprint);
  assert.equal(result.stale, true);
  assert.equal(result.fields.ogrnip, '');
});

test('IP equivalence removes only known leading prefix and preserves punctuation and other names', () => {
  assert.equal(compareRegistryFacts(fields, { type: 'ip', fullName: 'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ' }).find(item => item.field === 'fullName').status, 'match');
  assert.equal(compareRegistryFacts({ ...fields, fullName: 'Индивидуальный предприниматель Бабаев Фатда Ханоглан Оглы' }, { type: 'ip', fullName: 'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ' }).find(item => item.field === 'fullName').status, 'match');
  for (const fullName of ['И.П. БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ', 'ИП БАБАЕВ ФАТДА ХАНОГЛАН-ОГЛЫ', 'ООО БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ']) assert.equal(compareRegistryFacts({ ...fields, fullName }, { type: 'ip', fullName: 'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ' }).find(item => item.field === 'fullName').status, 'choice');
});

const outDir = '.tmp/fns-auto-verification-ssr-check';
await build({ configFile: false, logLevel: 'error', plugins: [react()], build: { ssr: true, outDir, rollupOptions: { input: path.resolve('src/screens/documents/CounterpartyVerification.jsx'), output: { entryFileNames: 'verification.mjs' } } } });
const { default: Verification } = await import(pathToFileURL(path.resolve(outDir, 'verification.mjs')));
test('partial SSR exposes missing address, source/date and confirmed fields without green checked card', () => {
  const html = renderToStaticMarkup(createElement(Verification, { report }));
  assert.match(html, /Проверено частично/);
  assert.match(html, /Полная проверка не завершена/);
  assert.match(html, /Юридический адрес/);
  assert.match(html, /326470400103966/);
  assert.match(html, /МСК/);
  assert.match(html, /https:\/\/egrul.nalog.ru/);
  assert.doesNotMatch(html, /card--checked|НЕ ПОДТВЕРЖДЁН/);
});

test('unavailable SSR distinguishes safe captcha timeout and not-found messages without checked card',()=>{
 for(const message of ['ФНС запросила капчу. Автоматическая проверка не завершена.','ФНС не ответила вовремя. Проверка не завершена.','По точному ИНН сведения не получены.']){
  const html=renderToStaticMarkup(createElement(Verification,{report:{sources:[{id:'fns',status:'unavailable',message}],comparisons:[]}}));
  assert.ok(html.includes(message));assert.match(html,/Не проверено/);assert.doesNotMatch(html,/card--checked/);
 }
});
