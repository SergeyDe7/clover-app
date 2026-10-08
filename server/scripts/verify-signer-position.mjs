import test from 'node:test';
import assert from 'node:assert/strict';
import { signerPositionGenitive, fillSignerPositionGenitive } from '../../src/shared/contracts/signerPosition.js';

test('known titles normalize Cyrillic and whitespace without guessing unknown titles', () => {
  assert.equal(signerPositionGenitive(' ГЕНЕРАЛЬНЫЙ  ДИРЕКТОР '), 'генерального директора');
  assert.equal(signerPositionGenitive('Директор по качеству'), 'директора по качеству');
  assert.equal(signerPositionGenitive('Индивидуальный предприниматель'), 'индивидуального предпринимателя');
  assert.equal(signerPositionGenitive('Заместитель генерального директора'), 'заместителя генерального директора');
  assert.equal(signerPositionGenitive('Главный бухгалтер'), 'главного бухгалтера');
  assert.equal(signerPositionGenitive('Управляющий директор'), 'управляющего директора');
  assert.equal(signerPositionGenitive('Представитель'), 'представителя');
  for (const title of ['Заместитель директора по инновациям', 'Директор / представитель', '', null]) assert.equal(signerPositionGenitive(title), '');
});
test('recognition fills only missing genitive and preserves explicit source data', () => {
  const source = { signerPosition: 'Генеральный директор', signerPositionGenitive: '', inn: 'unchanged' };
  const next = fillSignerPositionGenitive(source);
  assert.equal(next.fields.signerPositionGenitive, 'генерального директора');
  assert.equal(next.autoValue, 'генерального директора');
  assert.equal(source.signerPositionGenitive, '');
  assert.equal(next.fields.inn, source.inn);
  const explicit = { ...source, signerPositionGenitive: 'представителя по доверенности' };
  assert.deepEqual(fillSignerPositionGenitive(explicit), { fields: explicit, autoValue: null });
});
test('changing job title refreshes owned suggestion and removes stale unknown suggestion', () => {
  const first = fillSignerPositionGenitive({ signerPosition: 'Директор', signerPositionGenitive: '' });
  const second = fillSignerPositionGenitive({ ...first.fields, signerPosition: 'Генеральный директор' }, first.autoValue);
  assert.equal(second.fields.signerPositionGenitive, 'генерального директора');
  const unknown = fillSignerPositionGenitive({ ...second.fields, signerPosition: 'Специальный представитель' }, second.autoValue);
  assert.equal(unknown.fields.signerPositionGenitive, '');
  assert.equal(unknown.autoValue, null);
});
test('manual correction is retained even when equal to an earlier automatic suggestion', () => {
  const manual = { signerPosition: 'Управляющий', signerPositionGenitive: 'директора' };
  assert.equal(fillSignerPositionGenitive(manual, null).fields.signerPositionGenitive, 'директора');
  const cleared = fillSignerPositionGenitive({ ...manual, signerPositionGenitive: '' }, null);
  assert.equal(cleared.fields.signerPositionGenitive, 'управляющего');
});
