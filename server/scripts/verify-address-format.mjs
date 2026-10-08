import test from 'node:test';
import assert from 'node:assert/strict';
import {orderRecognizedAddress, formatRecognizedAddresses} from '../../src/shared/contracts/addressFormat.js';
import {fillSharedIpAddress} from '../../src/shared/contracts/ipAddress.js';

const source = 'улица Венская, д. 4, корп./ст. 2, кв./оф. 468, Ленинградская область, р-н Всеволожский, г. Кудрово';
const ordered = 'Ленинградская область, р-н Всеволожский, г. Кудрово, улица Венская, д. 4, корп./ст. 2, кв./оф. 468';

test('reorders street-first address without resolving ambiguous export labels', () => {
  assert.equal(orderRecognizedAddress(source), ordered);
  assert.deepEqual(orderRecognizedAddress(source).split(', ').sort(), source.split(', ').sort());
  assert.equal(orderRecognizedAddress(ordered), ordered);
});
test('preserves postcode, litera and numbered address details exactly', () => {
  const address = `188691, улица Венская, д. 4, лит. А, корп. 2, кв. 468, Ленинградская область, Всеволожский район, г. Кудрово`;
  const result = orderRecognizedAddress(address);
  assert.equal(result, '188691, Ленинградская область, Всеволожский район, г. Кудрово, улица Венская, д. 4, лит. А, корп. 2, кв. 468');
  assert.deepEqual(result.split(', ').sort(), address.split(', ').sort());
});
test('unknown parts, two cities and incomplete addresses are unchanged', () => {
  for (const value of [source + ', г. Санкт-Петербург', source + ', рядом с парком', source.replace('р-н Всеволожский, ', ''), source + ', 188691, 188692', 'г. Пример, ул. Тестовая, д. 1']) {
    assert.equal(orderRecognizedAddress(value), value);
  }
});
test('formatting retains original evidence and AI metadata after merge', () => {
  const result = {fields: {legalAddress: source}, warnings: [], provenance: {legalAddress: {source: 'ai', snippets: ['Адрес: ' + source], evidence: source}}};
  const next = formatRecognizedAddresses(result);
  assert.equal(next.fields.legalAddress, ordered);
  assert.equal(result.fields.legalAddress, source);
  assert.deepEqual(next.provenance.legalAddress.snippets, result.provenance.legalAddress.snippets);
  assert.equal(next.provenance.legalAddress.evidence, source);
  assert.equal(next.provenance.legalAddress.originalValue, source);
  assert.equal(next.provenance.legalAddress.source, 'ai');
  assert.equal(formatRecognizedAddresses(next), next);
});
test('unresolved candidate addresses stay unchanged', () => {
  const result = {fields: {legalAddress: source}, warnings: [{code: 'AMBIGUOUS_REQUISITE', field: 'legalAddress', candidates: [source, 'Другой адрес']}]};
  assert.equal(formatRecognizedAddresses(result), result);
});
test('single generic IP address fills both fields with ordered value and original evidence', () => {
  const result = {fields: {type: 'ip', legalAddress: source}, warnings: [{code: 'ADDRESS_KIND_UNSPECIFIED', field: 'legalAddress'}], provenance: {legalAddress: {source: 'local_text', snippets: [source]}}};
  const next = fillSharedIpAddress(result);
  assert.equal(next.fields.legalAddress, ordered);
  assert.equal(next.fields.postalAddress, ordered);
  assert.equal(next.provenance.legalAddress.originalValue, source);
  assert.equal(next.provenance.postalAddress.originalValue, source);
  assert.deepEqual(next.provenance.postalAddress.snippets, [source]);
});
