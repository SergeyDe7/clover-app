import test from 'node:test';import assert from 'node:assert/strict';
import {fillSharedIpAddress} from '../../src/shared/contracts/ipAddress.js';
import {recognizeFields} from '../src/documents/extraction.js';
const ip='ИНН 123456789047\nОГРНИП 312345678901230\n';
test('generic IP address fills both fields with original provenance and review notice',()=>{
 const original=recognizeFields(ip+'Адрес: г. Пример, ул. Тестовая, д. 1');
 const next=fillSharedIpAddress(original);
 assert.equal(next.fields.postalAddress,next.fields.legalAddress);
 assert.equal(next.fields.postalAddress,'г. Пример, ул. Тестовая, д. 1');
 assert.equal(original.fields.postalAddress,undefined);
 assert.deepEqual(next.provenance.postalAddress.snippets,original.provenance.legalAddress.snippets);
 assert(next.warnings.some(item=>item.code==='IP_SHARED_ADDRESS_REVIEW'));
});
test('separately supplied addresses and OOO are not copied or overwritten',()=>{
 for(const text of [ip+'Юридический адрес: Первый адрес',ip+'Адрес: Общий адрес\nЮридический адрес: Общий адрес',ip+'Юридический адрес: Первый адрес\nПочтовый адрес: Второй адрес','ИНН 1234567894\nОГРН 1123456789015\nАдрес: Общий адрес']){
  const original=recognizeFields(text);assert.equal(fillSharedIpAddress(original),original);
 }
 const explicit=recognizeFields(ip+'Адрес: Общий адрес\nПочтовый адрес: Другой адрес');
 assert.equal(fillSharedIpAddress(explicit).fields.postalAddress,'Другой адрес');
});
test('missing or ambiguous address stays unresolved',()=>{
 for(const text of [ip,ip+'Адрес: Первый адрес\nАдрес: Второй адрес']){
  const original=recognizeFields(text);assert.equal(fillSharedIpAddress(original),original);
 }
});
