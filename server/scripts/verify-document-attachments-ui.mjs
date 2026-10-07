import test from 'node:test';
import assert from 'node:assert/strict';
import { canAttachDocumentFiles, validateDocumentAttachment } from '../../src/shared/contracts/documentAttachments.js';
import { loadStandaloneDocumentOptions } from '../../src/shared/contracts/standaloneOptions.js';
const draft = { category: 'addendum', title: 'Соглашение № 2', file: { name: 'signed.PDF', size: 100 } };
test('attachment validation rejects missing and unsafe inputs before upload', () => {
  assert.equal(validateDocumentAttachment(draft), '');
  for (const bad of [{ title: ' ' }, { title: 'x'.repeat(201) }, { category: 'unknown' }, { file: null }, { file: { name: 'file.docx', size: 100 } }, { file: { name: 'file.pdf', size: 0 } }, { file: { name: 'file.pdf', size: 10 * 1024 * 1024 + 1 } }]) assert.notEqual(validateDocumentAttachment({ ...draft, ...bad }), '');
  assert.equal(validateDocumentAttachment({ ...draft, title: 'x'.repeat(200), file: { name: 'file.png', size: 10 * 1024 * 1024 } }), '');
});
test('only signed non-trash contracts with effective server permission can attach a package file', () => {
  assert.equal(canAttachDocumentFiles({ status: 'signed', canAttachDocuments: true }, false), true);
  assert.equal(canAttachDocumentFiles({ status: 'signed', canAttachDocuments: false }, true), false);
  assert.equal(canAttachDocumentFiles({ status: 'signed' }, true, true), false);
  assert.equal(canAttachDocumentFiles({ status: 'generated', canAttachDocuments: true }, true), false);
  assert.equal(canAttachDocumentFiles({ status: 'signed' }, false), false);
});
test('standalone workspace retains archive package permissions and fails closed for disabled archive', async () => {
  for (const enabled of [true, false]) {
    const options = await loadStandaloneDocumentOptions({
      getStandaloneDocumentOptions: async () => ({ capabilities: { create: true, purge: true } }),
      getArchiveDocumentOptions: async () => ({ enabled, capabilities: { attachDocuments: true, purge: true } }),
    });
    assert.equal(options.capabilities.create, true);
    assert.equal(options.capabilities.attachDocuments, enabled);
    assert.equal(options.capabilities.purge, enabled);
  }
});
