import test from 'node:test';import assert from 'node:assert/strict';
import {hasSignedScan,filterSavedDocuments} from '../../src/shared/contracts/savedDocuments.js';
test('scan indicator follows saved file rather than status or local selection',()=>{
 assert.equal(hasSignedScan({status:'signed',files:[]}),false);
 assert.equal(hasSignedScan({status:'generated',files:[{type:'pdf'}]}),false);
 assert.equal(hasSignedScan({status:'signed',files:[{type:'signed'}]}),true);
});
test('INN matches complete or partial digits for IP and OOO; invalid input never matches all',()=>{
 const documents=[{counterparty:{inn:'123456789012'}},{counterparty:{inn:'9876543210'}}];
 assert.equal(filterSavedDocuments(documents,'').length,2);
 assert.equal(filterSavedDocuments(documents,'123456789012').length,1);
 assert.equal(filterSavedDocuments(documents,'987').length,1);
 assert.equal(filterSavedDocuments(documents,' 987 654 ').length,1);
 for(const query of ['abc','9999999999999','123%'])assert.equal(filterSavedDocuments(documents,query).length,0);
});

test('organization and IP prefix search ignores legal form, quotes, case and yo',()=>{
 const documents=[
  {counterparty:{fullName:'ООО «Клевер»',inn:'1234567890'}},
  {counterparty:{fullName:'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «МАНУФАКТУРА ФЕРРО»'}},
  {counterparty:{fullName:'Индивидуальный предприниматель КИМ СЕРГЕЙ ИВАНОВИЧ'}},
  {counterparty:{fullName:'ИП Ёлкин Петр Иванович'}}];
 for(const query of ['кл','КЛЕ','ООО Кле','«кл'])assert.equal(filterSavedDocuments(documents,query)[0],documents[0]);
 assert.equal(filterSavedDocuments(documents,'ману')[0],documents[1]);
 assert.equal(filterSavedDocuments(documents,'ким')[0],documents[2]);
 assert.equal(filterSavedDocuments(documents,'елк')[0],documents[3]);
 assert.equal(filterSavedDocuments(documents,'ферро').length,0);
 assert.equal(filterSavedDocuments(documents,'%').length,0);
 assert.equal(filterSavedDocuments(documents,' ').length,4);
});
