import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { applyEmptyRegistryProposals, applyRegistryChoice, verificationFingerprint, officialVerificationUrl } from '../../src/shared/contracts/verificationSnapshot.js';

const outDir = '.tmp/counterparty-verification-ssr-check';
await build({ configFile: false, logLevel: 'error', plugins: [react()], build: { ssr: true, outDir, rollupOptions: { input: path.resolve('src/screens/documents/CounterpartyVerification.jsx'), output: { entryFileNames: 'verification.mjs' } } } });
const { default: Verification } = await import(pathToFileURL(path.resolve(outDir, 'verification.mjs')));
const render = (report, props = {}) => renderToStaticMarkup(createElement(Verification, { report, ...props }));

test('unconfigured and ambiguous sources never claim records or verified requisites', () => {
  const html = render({ sources: [{ id: 'fns', status: 'ambiguous' }, { id: 'fssp', status: 'not_configured', records: [{ summary: 'should not show' }] }], comparisons: [{ sourceId: 'fns', field: 'inn', status: 'match', registry: 'hidden value' }] });
  assert.match(html, /Не проверено/);
  assert.match(html, /Не удалось однозначно/);
  assert.doesNotMatch(html, /should not show|hidden value|Записей в ответе/);
});

test('conflict exposes both facts and accessible disabled choices while busy', () => {
  const html = render({ sources: [{ id: 'fns', status: 'checked' }], comparisons: [{ sourceId: 'fns', field: 'legalAddress', status: 'choice', original: 'Адрес карточки', registry: 'Адрес реестра', sourceUrl: 'https://egrul.nalog.ru/', checkedAt: '2026-10-07T09:00:00Z' }] }, { busy: true, onChoose() {} });
  assert.match(html, /Адрес карточки/); assert.match(html, /Адрес реестра/);
  assert.match(html, /aria-label="Юридический адрес: использовать значение из карточки" disabled=""|disabled="" aria-label="Юридический адрес: использовать значение из карточки"/);
  assert.match(html, /Найдены разные значения/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('missing field displays automatic discovery provenance and registry value', () => {
  const html = render({ sources: [{ id: 'fns', status: 'checked' }], comparisons: [{ sourceId: 'fns', field: 'ogrnip', status: 'proposal', original: '', registry: '123456789012345', sourceUrl: 'https://egrul.nalog.ru/', checkedAt: '2026-10-07T09:00:00Z' }] });
  assert.match(html, /Найдено автоматически/); assert.match(html, /123456789012345/); assert.match(html, /Проверено:/);
});

test('source links permit only official HTTPS domains, rejecting unsafe and lookalike URLs', () => {
  for (const url of ['javascript:alert(1)', 'http://egrul.nalog.ru', 'https://egrul.nalog.ru.evil.example', 'https://evil.example/?next=nalog.gov.ru', 'https://user@egrul.nalog.ru', 'https://egrul.nalog.ru:444/', 'https://unknown.nalog.ru/']) assert.equal(officialVerificationUrl(url), null);
  assert.equal(officialVerificationUrl('https://egrul.nalog.ru/'), 'https://egrul.nalog.ru/');
  assert.equal(officialVerificationUrl('https://kad.arbitr.ru/'), 'https://kad.arbitr.ru/');
  const html = render({ sources: [{ id: 'fssp', status: 'checked', sourceUrl: 'javascript:alert(1)', records: [{ summary: '<script>alert(1)</script>', url: 'https://evil.example/' }] }] });
  assert.doesNotMatch(html, /href=|<script>/); assert.match(html, /&lt;script&gt;/);
});

test('stale reports and nonempty fields cannot be overwritten by automatic proposals', () => {
  const fields = { inn: '123', fullName: 'Название карточки', ogrnip: '' };
  const report = { sources: [{ id: 'fns', status: 'checked' }], comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'proposal', registry: 'Другое имя' }, { sourceId: 'fns', field: 'ogrnip', status: 'proposal', registry: '123456789012345' }, { sourceId: 'fns', field: 'bankName', status: 'proposal', registry: 'Нельзя' }] };
  const original = verificationFingerprint(fields);
  const result = applyEmptyRegistryProposals(fields, report, original);
  assert.equal(result.fields.fullName, fields.fullName); assert.equal(result.fields.ogrnip, '123456789012345'); assert.equal(result.fields.bankName, undefined);
  assert.deepEqual(result.applied, ['ogrnip']); assert.equal(fields.ogrnip, '');
  const edited = { ...fields, inn: '456' };
  assert.equal(applyEmptyRegistryProposals(edited, report, original).stale, true);
});

test('conflict requires explicit choice and original snapshot, with no unchecked-source changes', () => {
  const fields = { legalAddress: 'Адрес карточки' };
  const fingerprint = verificationFingerprint(fields);
  const report = { sources: [{ id: 'fns', status: 'checked' }], comparisons: [{ sourceId: 'fns', field: 'legalAddress', status: 'choice', original: fields.legalAddress, registry: 'Адрес реестра' }] };
  assert.equal(applyRegistryChoice(fields, report, fingerprint, 'legalAddress', 'registry').legalAddress, 'Адрес реестра');
  assert.equal(applyRegistryChoice(fields, report, fingerprint, 'legalAddress', 'original').legalAddress, 'Адрес карточки');
  assert.equal(applyRegistryChoice({ legalAddress: 'Ручное исправление' }, report, fingerprint, 'legalAddress', 'registry'), null);
  assert.equal(applyRegistryChoice(fields, { ...report, sources: [{ id: 'fns', status: 'unavailable' }] }, fingerprint, 'legalAddress', 'registry'), null);
});

test('empty and loading states do not promise a checked counterparty', () => {
  assert.match(render(null), /Не проверено/);
  assert.match(render(null, { busy: true }), /Проверяем сведения/);
});
