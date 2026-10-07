import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { analyzeSignerName, fillSignerNameGenitive } from '../../src/shared/contracts/nameDeclension.js';

test('male/female full names, irregular given names and hyphenated surnames are deterministic', () => {
  const examples = [
    ['КИМ СЕРГЕЙ ИВАНОВИЧ', 'Кима Сергея Ивановича'],
    ['Иванов Петр Ильич', 'Иванова Петра Ильича'],
    ['Иванов Пётр Ильич', 'Иванова Петра Ильича'],
    ['ИВАНОВ БОГДАН ПЕТРОВИЧ', 'Иванова Богдана Петровича'],
    ['Иванов-Петров Павел Никитич', 'Иванова-Петрова Павла Никитича'],
    ['Бонч-Бруевич Лев Иванович', 'Бонч-Бруевича Льва Ивановича'],
    ['Примерский Сергей Иванович', 'Примерского Сергея Ивановича'],
    ['Иванова Мария Павловна', 'Ивановой Марии Павловны'],
    ['Тестовая Анна Ивановна', 'Тестовой Анны Ивановны'],
    ['Юн Анна Сергеевна', 'Юн Анны Сергеевны'],
    ['Седых Сергей Иванович', 'Седых Сергея Ивановича'],
    ['Черных Иван Петрович', 'Черных Ивана Петровича'],
  ];
  for (const [input, expected] of examples) {
    const result = analyzeSignerName(input);
    assert.equal(result.status, 'resolved', input);
    assert.equal(result.value, expected, input);
    assert.deepEqual(analyzeSignerName(input), result);
  }
});

test('initials, unknown names, gender conflicts and malformed input are explicitly unresolved', () => {
  for (const input of ['Петров И. И.', 'Петров Сергей', 'Петров Анна Иванович', 'Петров Иван Ивановна',
    'Петров Аноним Иванович', 'Ли Чжан Вэй', 'Smith John Иванович', 'Петров Иван Иванович; другой', '', null]) {
    const result = analyzeSignerName(input);
    assert.equal(result.status, 'unresolved', String(input));
    assert.equal(result.value, '');
    assert.ok(result.reason.length > 0);
  }
});

test('organization signers get missing suggestions while explicit corrections stay immutable', () => {
  const source = { type: 'ooo', signerFullName: 'Иванова Мария Павловна', signerFullNameGenitive: '' };
  assert.equal(fillSignerNameGenitive(source).fields.signerFullNameGenitive, 'Ивановой Марии Павловны');
  assert.equal(source.signerFullNameGenitive, '');
  const manual = { ...source, signerFullNameGenitive: 'Подтверждённая форма' };
  assert.equal(fillSignerNameGenitive(manual).fields, manual);
  const unsupported = { ...source, signerFullName: 'Иванова М. П.' };
  assert.deepEqual(fillSignerNameGenitive(unsupported).fields, unsupported);
  const first = fillSignerNameGenitive(source);
  const changed = fillSignerNameGenitive({ ...first.fields, signerFullName: 'Петров Петр Ильич' }, first.autoValue);
  assert.equal(changed.fields.signerFullNameGenitive, 'Петрова Петра Ильича');
  const cleared = fillSignerNameGenitive({ ...changed.fields, signerFullName: 'Петров П. И.' }, changed.autoValue);
  assert.equal(cleared.fields.signerFullNameGenitive, '');
  assert.equal(cleared.autoValue, '');
  assert.equal(fillSignerNameGenitive({ ...cleared.fields, signerFullName: source.signerFullName }, cleared.autoValue).fields.signerFullNameGenitive, first.autoValue);
});

test('pinned local rules, original source and license retain audited SHA256 and equivalent ESM data', async () => {
  const base = new URL('../../src/shared/contracts/vendorfiles/', import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('PROVENANCE.json', base), 'utf8'));
  assert.equal(metadata.commit, '41858f9e3073aa593856968d90061d0771f57743');
  assert.equal(metadata.license, 'MIT');
  for (const [filename, expected] of Object.entries(metadata.sha256)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(filename, base))).digest('hex'), expected, filename);
  }
  const original = JSON.parse(await readFile(new URL('rules.json', base), 'utf8'));
  assert.deepEqual((await import(new URL('rules.js', base))).default, original);
});
