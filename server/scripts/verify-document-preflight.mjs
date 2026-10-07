import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDocumentPreflight, guardDocumentSubmission } from '../../src/shared/contracts/documentPreflight.js';

const fields = { type: 'ip', fullName: 'ИП Ким Сергей Иванович', inn: '123456789047', ogrnip: '312345678901230', legalAddress: 'г. Пример, д. 1', bankName: 'Тестовый банк', bik: '123456789', settlementAccount: '1'.repeat(20), correspondentAccount: '2'.repeat(20), signerFullName: 'Ким Сергей Иванович', signerFullNameGenitive: 'Кима Сергея Ивановича', signerPosition: 'Индивидуальный предприниматель', signerPositionGenitive: 'индивидуального предпринимателя', phone: '', email: '' };
const input = { fields, supplier: 'synthetic-supplier', date: '2026-10-06', paymentType: 'prepayment', confirmed: true };

test('missing required requisites return precise errors with zero validation or generation calls', () => {
  const calls = [];
  const result = guardDocumentSubmission({ ...input, fields: { ...fields, inn: '', bankName: '', signerFullNameGenitive: '' } }, () => { calls.push('validate', 'generate'); });
  assert.equal(result.preflight.valid, false);
  assert.equal(result.preflight.firstField, 'inn');
  assert.ok(result.preflight.errors.some(error => error.field === 'inn' && error.message.startsWith('ИНН:')));
  assert.ok(result.preflight.errors.some(error => error.field === 'signerFullNameGenitive'));
  assert.deepEqual(calls, []);
  assert.equal(result.pending, undefined);
});

test('valid input without optional contacts still proceeds to authoritative server validation', async () => {
  const calls = [];
  const result = guardDocumentSubmission(input, async () => { calls.push('server-validation'); calls.push('draft'); calls.push('generate'); });
  await result.pending;
  assert.equal(result.preflight.valid, true);
  assert.deepEqual(calls, ['server-validation', 'draft', 'generate']);
  assert.equal(result.preflight.warnings.filter(warning => warning.code === 'CONTACT_OMITTED').length, 2);
  assert.equal(checkDocumentPreflight({ ...input, confirmed: false }).valid, false);
});

test('postpayment days, source ambiguity and invalid calendar dates fail before submission', () => {
  for (const days of ['', '0', '2.5', '-1', '10000']) assert.ok(checkDocumentPreflight({ ...input, paymentType: 'postpayment', days }).errors.some(error => error.field === 'days'));
  assert.ok(checkDocumentPreflight({ ...input, date: '2026-02-30' }).errors.some(error => error.field === 'date'));
  const ambiguous = { ...input, warnings: [{ field: 'bankName', code: 'AMBIGUOUS_REQUISITE' }] };
  assert.equal(checkDocumentPreflight(ambiguous).valid, false);
  assert.equal(checkDocumentPreflight({ ...ambiguous, reviews: { bankName: fields.bankName } }).valid, true);
});

test('a missing genitive can remain in a draft, but cannot generate files', () => {
  const incomplete = { ...input, fields: { ...fields, signerFullNameGenitive: '' } };
  assert.equal(checkDocumentPreflight({ ...incomplete, generate: false }).valid, true);
  assert.equal(checkDocumentPreflight(incomplete).valid, false);
});

test('empty ambiguous optional contacts can be omitted only with explicit agreement', () => {
  for (const field of ['phone', 'email']) {
    const warnings = [{field, code: 'AMBIGUOUS_REQUISITE', candidates: ['first', 'second']}];
    for (const generate of [true, false]) {
      const result = checkDocumentPreflight({...input, warnings, generate});
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some(warning => warning.field === field && warning.code === 'CONTACT_OMITTED'));
      assert.equal(checkDocumentPreflight({...input, warnings, generate, confirmed: false}).valid, false);
    }
  }
});

test('filled ambiguous contacts still require value-specific review', () => {
  for (const [field, value] of [['phone', '+7 (977) 777-77-77'], ['email', 'client@example.com']]) {
    const next = {...input, fields: {...fields, [field]: value}, warnings: [{field, code: 'AMBIGUOUS_REQUISITE', candidates: [value, 'other']}]};
    assert.equal(checkDocumentPreflight(next).valid, false);
    assert.equal(checkDocumentPreflight({...next, reviews: {[field]: value}}).valid, true);
  }
});
