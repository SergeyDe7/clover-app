import test from 'node:test';
import assert from 'node:assert/strict';
import { isImportedContract, validateArchivedDocumentInput } from '../../src/shared/contracts/archivedDocuments.js';
import { filterSavedDocuments, hasSignedScan } from '../../src/shared/contracts/savedDocuments.js';

const draft = { legalEntityId: 'supplier-test', number: 'исторический-2020/5', fullName: 'ИП Ким Сергей Иванович' };
const file = { name: 'Подписанный договор.pdf', size: 100 };

test('archive upload needs only supplier, number, name and file without INN, type or a confirmation flag', () => {
  assert.deepEqual(validateArchivedDocumentInput({ draft, file }), []);
  assert.ok(validateArchivedDocumentInput({ draft: { ...draft, legalEntityId: '' }, file }).some(message => message.includes('юрлицо')));
  assert.ok(validateArchivedDocumentInput({ draft: { ...draft, fullName: '   ' }, file }).some(message => message.includes('наименование')));
});

test('unsupported or empty files cannot enter the signed scan archive', () => {
  for (const invalid of [null, { name: 'Договор.docx', size: 100 }, { name: 'Договор.pdf', size: 0 }]) {
    assert.ok(validateArchivedDocumentInput({ draft, file: invalid }).some(message => message.includes('PDF')));
  }
  for (const name of ['скан.JPG', 'скан.jpeg', 'скан.png']) assert.deepEqual(validateArchivedDocumentInput({ draft, file: { name, size: 100 } }), []);
});

test('archive number and file size boundaries match the server limits before upload', () => {
  const check = (number, size) => validateArchivedDocumentInput({ draft: { ...draft, number }, file: { ...file, size } });
  assert.deepEqual(check('x'.repeat(100), 10 * 1024 * 1024), []);
  assert.ok(check('x'.repeat(101), 100).some(message => message.includes('100 символов')));
  assert.ok(check('   ', 100).some(message => message.includes('номер')));
  assert.deepEqual(check(`  ${'x'.repeat(100)}  `, 100), [], 'the trimmed number is sent to the server');
  assert.ok(check(draft.number, 10 * 1024 * 1024 + 1).some(message => message.includes('10 МБ')));
});

test('imported contracts use the same name/INN search and actual signed-file indicator as generated documents', () => {
  const imported = { id: 'archive-1', kind: 'imported_contract', number: draft.number, status: 'signed', counterparty: draft, files: [{ type: 'signed', id: 'signed-1' }] };
  assert.equal(isImportedContract(imported), true);
  assert.equal(isImportedContract({ status: 'signed' }), false);
  assert.deepEqual(filterSavedDocuments([imported], 'ким'), [imported]);
  assert.deepEqual(filterSavedDocuments([imported], '123456'), [], 'no INN is fabricated for a simplified archive entry');
  const legacy = { ...imported, counterparty: { ...draft, inn: '123456789047' } };
  assert.deepEqual(filterSavedDocuments([legacy], '123456'), [legacy]);
  assert.equal(hasSignedScan(imported), true);
  assert.equal(hasSignedScan({ ...imported, files: [{ type: 'original_scan' }] }), false);
});
