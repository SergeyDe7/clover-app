import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canScheduleRegistryVerification, registryConfirmationText, currentRegistryChoices, currentRegistryVerification, verificationFingerprint, applyRegistryChoice, serverRegistryAdvisory, savedRegistryFeedback } from '../../src/shared/contracts/verificationSnapshot.js';

const ip = { type: 'ip', inn: '470422791518', fullName: 'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ', ogrnip: '326470400103966' };
const ooo = { type: 'ooo', inn: '7813676246', fullName: 'МАНУФАКТУРА ФЕРРО', ogrn: '1237800131304', kpp: '781301001', legalAddress: 'Адрес из карточки' };
const source = (fields, status = 'checked') => ({ id: 'fns', status, checkedFields: ['type', 'inn', 'fullName', fields.type === 'ip' ? 'ogrnip' : 'ogrn', ...(fields.type === 'ooo' ? ['kpp'] : [])], ...(status === 'partial' ? { missingFields: ['legalAddress'] } : {}) });
const partialReport = { sources: [source(ooo, 'partial')], comparisons: [] };
const args = { configured: true, busy: '', alternativeRequired: false, fields: ip, epoch: 1, alive: true, lastAttempt: null, snapshot: null };

test('manual valid INN queues one automatic request; AI busy, invalid type, report, request, unmount do not', () => {
  assert.equal(canScheduleRegistryVerification(args), true);
  for (const change of [{ busy: 'AI' }, { configured: false }, { alive: false }, { alternativeRequired: true }, { fields: { ...ip, inn: '470422791511' } }, { fields: { ...ip, type: 'ooo' } }, { snapshot: verificationFingerprint(ip) }, { lastAttempt: `1:${verificationFingerprint(ip)}` }]) assert.equal(canScheduleRegistryVerification({ ...args, ...change }), false);
  assert.equal(canScheduleRegistryVerification({ ...args, epoch: 2, fields: { ...ip, fullName: 'Правка' }, lastAttempt: `1:${verificationFingerprint(ip)}` }), true);
});

test('no FNS gates remain on confirm/draft/create; ordinary local validators and debounce remain', async () => {
  const workspace = await readFile(new URL('../../src/screens/documents/DocumentWorkspace.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /registryBlocked|registryReady|requiredRegistryReady|disabled=\{verificationBusy\}.*type="submit"/);
  assert.match(workspace, /disabled=\{Boolean\(busy\) \|\| !confirmed\}/);
  assert.match(workspace, /draftReviewBlocked \|\| alternativeRequired/);
  assert.match(workspace, /guardDocumentSubmission/);
  assert.match(workspace, /recognized \? 0 : 700/);
  assert.match(workspace, /setVerificationBusy\(true\)/);
  assert.doesNotMatch(workspace, /perform\('Проверяем контрагента/);
  assert.match(workspace, /Вася помог разобрать карточку/);
});

test('advisory server report preserves unresolved mismatches and marks only explicit confirmed original', () => {
  const report = { ...partialReport, comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'choice', original: 'Из карточки', registry: ooo.fullName }] };
  const unresolved = serverRegistryAdvisory({ report, decisions: [{ field: 'fullName', choice: 'retained_current', status: 'unresolved' }], warnings: [{ message: 'Администратор использует текущее значение.' }] });
  assert.equal(unresolved.comparisons[0].status, 'choice');
  assert.equal(unresolved.comparisons[0].original, 'Из карточки');
  assert.equal(unresolved.warnings[0].message, 'Администратор использует текущее значение.');
  assert.equal(serverRegistryAdvisory({ report, decisions: [{ field: 'fullName', choice: 'original', status: 'confirmed' }] }).comparisons[0].status, 'selected_original');
  assert.equal(serverRegistryAdvisory({ report, decisions: [{ field: 'fullName', choice: 'original', status: 'stale' }] }).comparisons[0].status, 'choice');
});

test('unavailable/captcha and partial confirmation SSR allow administrator requisites with honest limitations', () => {
  for (const status of ['unavailable', 'ambiguous', 'not_configured', 'captcha']) {
    const text = registryConfirmationText(ooo, { sources: [source(ooo, status)] }, verificationFingerprint(ooo));
    const html = renderToStaticMarkup(createElement('p', null, text));
    assert.match(html, /Договор можно сформировать по реквизитам, выбранным администратором/);
    assert.doesNotMatch(html, /Проверено|разрешите расхождения/);
  }
  const html = renderToStaticMarkup(createElement('p', null, registryConfirmationText(ooo, partialReport, verificationFingerprint(ooo))));
  assert.match(html, /Юридический адрес ФНС не подтверждён/);
  assert.match(html, /используются текущие реквизиты/);
  assert.match(html, /Арбитраж и ФССП ещё не подключены/);
});

test('voluntary original/registry choices preserve selected data and observed pair; edits discard choices', () => {
  const fields = { ...ooo, fullName: 'Из карточки' };
  const report = { ...partialReport, comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'choice', original: fields.fullName, registry: ooo.fullName }] };
  assert.equal(fields.fullName, 'Из карточки');
  assert.equal(applyRegistryChoice(fields, report, verificationFingerprint(fields), 'fullName', 'original').fullName, 'Из карточки');
  assert.equal(applyRegistryChoice(fields, report, verificationFingerprint(fields), 'fullName', 'registry').fullName, ooo.fullName);
  assert.deepEqual(currentRegistryVerification(fields, verificationFingerprint(fields), report, { fullName: 'original' }), { choices: { fullName: 'original' }, expectedRegistry: { fullName: ooo.fullName } });
  assert.deepEqual(currentRegistryChoices({ ...fields, fullName: 'Правка' }, verificationFingerprint(fields), { fullName: 'original' }), {});
});

test('saved draft retains fresh warnings and saved generated contract displays latest changed FNS facts', async () => {
  const formReport = { ...partialReport, comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'match', registry: 'Прежнее имя' }] };
  const creation = { verification: { report: formReport, warnings: [{ message: 'Предупреждение при сохранении черновика' }] } };
  const generation = { job: { verification: { report: { ...partialReport, comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'choice', original: 'Прежнее имя', registry: 'Изменённое имя ФНС' }] }, warnings: [{ message: 'ФНС изменила сведения после проверки формы' }] } } };
  const draft = savedRegistryFeedback('draft-id', 'Черновик сохранён.', creation);
  assert.equal(draft.verification.warnings[0].message, 'Предупреждение при сохранении черновика');
  const generated = savedRegistryFeedback('generated-id', 'DOCX и PDF сформированы.', creation, generation, { status: 'succeeded' });
  assert.equal(generated.id, 'generated-id');
  assert.equal(generated.kind, 'success');
  assert.equal(generated.verification.comparisons[0].registry, 'Изменённое имя ФНС');
  assert.match(generated.message, /предупреждения или расхождения/);
  assert.equal(generated.verification.warnings[0].message, 'ФНС изменила сведения после проверки формы');
  const completed = { verification: { report: { ...partialReport, comparisons: [{ sourceId: 'fns', field: 'fullName', status: 'choice', original: 'Прежнее имя', registry: 'Последнее имя из завершённого задания' }] } } };
  assert.equal(savedRegistryFeedback('generated-id', 'Готово.', creation, generation, completed).verification.comparisons[0].registry, 'Последнее имя из завершённого задания');
  const outDir = '.tmp/advisory-saved-verification-ssr';
  await build({ configFile: false, logLevel: 'error', plugins: [react()], build: { ssr: true, outDir, rollupOptions: { input: path.resolve('src/screens/documents/CounterpartyVerification.jsx'), output: { entryFileNames: 'verification.mjs' } } } });
  const { default: Verification } = await import(pathToFileURL(path.resolve(outDir, 'verification.mjs')));
  const html = renderToStaticMarkup(createElement('section', null, createElement('p', null, generated.message), createElement(Verification, { report: generated.verification })));
  assert.match(html, /Изменённое имя ФНС/);
  assert.match(html, /ФНС изменила сведения после проверки формы/);
  const workspace = await readFile(new URL('../../src/screens/documents/DocumentWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(workspace, /setGenerationFeedback\(savedRegistryFeedback\(document.id, 'Черновик договора сохранён.', created\)\)/);
  assert.match(workspace, /created, generation, completed\)\)/);
  assert.match(workspace, /generationFeedback.verification && <CounterpartyVerification report=\{generationFeedback.verification\}/);
});
