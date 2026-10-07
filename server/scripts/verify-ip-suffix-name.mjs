import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractCard, recognizeFields, completeRecognizedFields } from '../src/documents/extraction.js';
import { fillIpSignerFromCard } from '../../src/shared/contracts/ipSigner.js';
import { analyzeSignerName } from '../../src/shared/contracts/nameDeclension.js';

const owner = 'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ';
const heading = `Индивидуальный предприниматель ${owner}`;
const address = 'улица Венская, д. 4, корп./ст. 2, кв./оф. 468, Ленинградская область, р-н Всеволожский, г. Кудрово';
const recognize = text => completeRecognizedFields(recognizeFields(text));

test('company label and explicit IP suffix preserve the supplied four-part owner', () => {
  const result = recognize(`Название компании: ${owner} (ИП)\nИНН: 470422791518\nАдрес: ${address}`);
  assert.equal(result.fields.fullName, heading);
  assert.equal(result.fields.signerFullName, owner);
  assert.equal(result.fields.signerPosition, 'Индивидуальный предприниматель');
  assert.equal(result.fields.signerPositionGenitive, 'индивидуального предпринимателя');
  assert.equal(result.fields.signerFullNameGenitive, undefined);
  assert.equal(analyzeSignerName(owner).status, 'unresolved');
  assert.equal(result.fields.legalAddress, address);
  assert(result.warnings.some(item => item.code === 'ADDRESS_KIND_UNSPECIFIED'));
  assert(result.provenance.fullName.snippets[0].includes(`${owner} (ИП)`));
});

test('split company label and standalone IP heading support only explicit ogly/kyzy suffixes', () => {
  for (const source of [`Название компании:\n${owner} (ИП)`, `ИП\n${owner}`, `ИП ${owner}`]) {
    assert.equal(recognize(`${source}\nИНН: 470422791518`).fields.signerFullName, owner);
  }
  const kyzy = 'ПРИМЕР ФАТДА ХАНОГЛАН КЫЗЫ';
  const next = fillIpSignerFromCard({ type: 'ip', fullName: `ИП ${kyzy}` });
  assert.equal(next.signerFullName, kyzy);
  assert.equal(next.signerFullNameGenitive, '');
  assert.equal(fillIpSignerFromCard({ type: 'ip', fullName: 'ИП ПРИМЕР ФАТДА ХАНОГЛАН ЛИШНЕЕ' }).signerFullName, undefined);
});

test('conflicting names stay ambiguous and explicit representatives remain intact', () => {
  const result = recognize(`Название компании: ${owner} (ИП)\nИП ПЕТРОВ ИВАН ИВАНОВИЧ\nИНН: 470422791518`);
  assert.equal(result.fields.fullName, undefined);
  assert.equal(result.fields.signerFullName, undefined);
  assert(result.warnings.some(item => item.field === 'fullName' && item.code === 'AMBIGUOUS_REQUISITE'));
  const representative = recognize(`Название компании: ${owner} (ИП)\nИНН: 470422791518\nПодписант: Петров Иван Иванович\nДолжность подписанта: Представитель`);
  assert.equal(representative.fields.signerFullName, 'Петров Иван Иванович');
  assert.equal(representative.fields.signerPosition, 'Представитель');
  const split = recognize('Название компании: БАБАЕВ ФАТДА\nХАНОГЛАН ОГЛЫ (ИП)\nИНН: 470422791518');
  assert.equal(split.fields.signerFullName, undefined);
});

test('bank names do not become entity names or IP owners', () => {
  for (const text of [`Наименование банка:\nООО «Пример Банк»`, `Банк:\nИП ${owner}`, `Банковские реквизиты:\nИП ${owner}`]) {
    assert.equal(recognize(text).fields.fullName, undefined);
    assert.equal(recognize(text).fields.signerFullName, undefined);
  }
  const result = recognize(`Название компании: ${owner} (ИП)\nИНН: 470422791518\nБанк: АО "АЛЬФА-БАНК"`);
  assert.equal(result.fields.fullName, heading);
  assert.equal(result.fields.bankName, 'АО "АЛЬФА-БАНК"');
});

test('equivalent suffix and prefix names do not create duplicate identities', () => {
  const result = recognize(`Название компании: ${owner} (ИП)\nИП ${owner}\nИНН: 470422791518`);
  assert.equal(result.fields.fullName, heading);
  assert(!result.warnings.some(item => item.field === 'fullName' && item.code === 'AMBIGUOUS_REQUISITE'));
});

test('optional user DOCX is extracted locally and copied exactly', { skip: !process.env.CLOVER_TEST_IP_SUFFIX_DOCX }, async () => {
  const result = await extractCard(await readFile(process.env.CLOVER_TEST_IP_SUFFIX_DOCX), { extension: 'docx' });
  assert.equal(result.fields.fullName, heading);
  assert.equal(result.fields.signerFullName, owner);
  assert.equal(result.fields.legalAddress, address);
  assert.equal(result.fields.signerFullNameGenitive, undefined);
});
