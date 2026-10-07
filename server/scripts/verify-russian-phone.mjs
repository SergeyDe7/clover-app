import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRussianPhone,formatRussianPhoneInput,russianPhoneCaret} from '../../src/shared/contracts/russianPhone.js';
import {recognizeFields} from '../src/documents/extraction.js';

test('complete Russian mobile and city numbers preserve every subscriber digit', () => {
  for (const raw of ['8 (952) 225-40-45','79522254045','9522254045','+7 952 225 40 45','8\u00a0952\u00a0225–40–45']) assert.equal(normalizeRussianPhone(raw),'+7 (952) 225-40-45');
  assert.equal(normalizeRussianPhone('8 (812) 315-12-34'),'+7 (812) 315-12-34');
  assert.equal(normalizeRussianPhone('8123151234'),'+7 (812) 315-12-34');
});
test('unsupported, incomplete and multiple numbers are never silently truncated', () => {
  for (const raw of ['+1 202 555 0199','8952225404512','+8 952 225 40 45','8 (952) 225-40-45 доб. 12','952225','9522254045; 9112223344']) {
    assert.equal(normalizeRussianPhone(raw),null);
    if (raw !== '952225') assert.equal(formatRussianPhoneInput(raw),raw);
  }
});
test('typing from 8 and from 9 and backspacing preserves subscriber digits', () => {
  for (const digits of ['89522254045','9522254045']) {
    let value='';
    for (const digit of digits) value=formatRussianPhoneInput(value+digit);
    assert.equal(value,'+7 (952) 225-40-45');
    value=formatRussianPhoneInput(value.slice(0,-1));
    assert.equal(value,'+7 (952) 225-40-4');
  }
  assert.equal(formatRussianPhoneInput(''), '');
  assert.equal(russianPhoneCaret('9','+7 (9',1),5);
  assert.equal(russianPhoneCaret('+7 (9522','+7 (952) 2',8),10);
});
test('card extraction canonicalizes equivalent formats while keeping distinct phones ambiguous', () => {
  const same=recognizeFields('Телефон: 8 (952) 225-40-45\nТел.: +7 952 225 40 45');
  assert.equal(same.fields.phone,'+7 (952) 225-40-45');
  assert(same.provenance.phone.snippets.some(text=>text.includes('8 (952)')));
  const different=recognizeFields('Телефон: 8 (952) 225-40-45\nТел.: 8 (911) 222-33-44');
  assert.equal(different.fields.phone,undefined);
  assert(different.warnings.some(issue=>issue.field==='phone' && issue.code==='AMBIGUOUS_REQUISITE'));
  for (const separator of [';', ',']) {
    const list=recognizeFields(`Телефон: 8 (952) 225-40-45${separator} 8 (911) 222-33-44`);
    assert.equal(list.fields.phone,undefined);
    assert(list.warnings.some(issue=>issue.field==='phone' && issue.code==='AMBIGUOUS_REQUISITE'));
  }
  const long=recognizeFields('Телефон: 8952225404512345\nИНН 1234567809');
  assert.notEqual(long.fields.phone,'+7 (952) 225-40-45');
  assert.equal(long.fields.inn,'1234567809');
  for (const suffix of ['доб. 12','добавочный: 1234','ext. 56','# 78']) {
    const extended=recognizeFields(`Телефон: 8 (952) 225-40-45 ${suffix}`);
    assert.equal(extended.fields.phone,`8 (952) 225-40-45 ${suffix}`);
  }
});
