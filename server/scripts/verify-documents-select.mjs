import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { nextDocumentOption } from '../../src/screens/documents/documentSelectNavigation.js';

test('document selector arrows wrap, Home/End select boundaries and disabled options are skipped', () => {
  const options = [{ value: 'a' }, { value: 'disabled', disabled: true }, { value: 'b' }, { value: 'c' }];
  assert.equal(nextDocumentOption(options, 'a', 'ArrowDown'), 'b');
  assert.equal(nextDocumentOption(options, 'a', 'ArrowUp'), 'c');
  assert.equal(nextDocumentOption(options, 'c', 'ArrowDown'), 'a');
  assert.equal(nextDocumentOption(options, 'b', 'Home'), 'a');
  assert.equal(nextDocumentOption(options, 'b', 'End'), 'c');
  assert.equal(nextDocumentOption([{ value: 'a', disabled: true }], 'a', 'ArrowDown'), null);
  assert.equal(nextDocumentOption([], 'removed-value', 'Home'), null);
});

test('rendered document controls expose selected labels, IDs, required/disabled state and three admin sections', async () => {
  const outDir = '.tmp/documents-select-ssr-check';
  await build({ configFile: false, logLevel: 'error', plugins: [react()], build: { ssr: true, outDir, rollupOptions: { input: { selector: path.resolve('src/screens/documents/DocumentSelect.jsx'), center: path.resolve('src/screens/documents/AdminDocumentCenter.jsx') }, output: { entryFileNames: '[name].mjs' } } } });
  const { default: Select } = await import(pathToFileURL(path.resolve(outDir, 'selector.mjs')));
  const children = [createElement('option', { key: 'empty', value: '' }, 'Выберите'), createElement('option', { key: 'ip', value: 'ip' }, 'ИП')];
  const html = renderToStaticMarkup(createElement(Select, { id: 'test-type', value: 'ip', 'aria-label': 'Тип клиента', required: true, disabled: true }, children));
  assert.match(html, /id="test-type"/u);
  assert.match(html, /role="combobox"/u);
  assert.match(html, /aria-label="Тип клиента"/u);
  assert.match(html, /aria-required="true"/u);
  assert.match(html, /disabled=""/u);
  assert.match(html, /<span>ИП<\/span>/u);
  assert.doesNotMatch(html, /<select|role="listbox"/u);
  const empty = renderToStaticMarkup(createElement(Select, { value: 'removed', 'aria-label': 'Пустой список' }));
  assert.match(empty, /Нет вариантов/u);
  const { AdminDocumentCenter } = await import(pathToFileURL(path.resolve(outDir, 'center.mjs')));
  const center = renderToStaticMarkup(createElement(AdminDocumentCenter, { serverClients: [], api: {} }));
  assert.match(center, />Договоры<\/button>/u);
  assert.match(center, />Сохранённые договоры<\/button>/u);
  assert.match(center, />Наши юрлица<\/button>/u);
  assert.match(center, /Генератор договоров/u);
  assert.doesNotMatch(center, /Клиент для нового договора|Выберите клиента|Документы клиента/u);
});
