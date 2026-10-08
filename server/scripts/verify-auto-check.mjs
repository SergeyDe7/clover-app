import test from 'node:test';
import assert from 'node:assert/strict';
import {fillSharedIpAddress} from '../../src/shared/contracts/ipAddress.js';
import {guardDocumentSubmission} from '../../src/shared/contracts/documentPreflight.js';
import { analyzeCounterparty, validInn } from '../../src/shared/contracts/requisiteChecks.js';
import { extractCard } from '../src/documents/extraction.js';

const fields={type:'ip',fullName:'ИП Ким Сергей Иванович',inn:'123456789047',ogrnip:'312345678901230',legalAddress:'г. Пример, д. 1',bankName:'Тестовый банк',bik:'123456789',settlementAccount:'1'.repeat(20),correspondentAccount:'2'.repeat(20),signerFullName:'Ким Сергей Иванович',signerFullNameGenitive:'Кима Сергея Ивановича',signerPosition:'Индивидуальный предприниматель',signerPositionGenitive:'Индивидуального предпринимателя'};
const status=(result,field)=>result.fields.find(item=>item.field===field)?.status;
test('technical checks validate formats and declensions without claiming external existence',()=>{
 assert(validInn(fields.inn));const result=analyzeCounterparty(fields);
 assert.equal(status(result,'inn'),'checked');assert.equal(status(result,'signerFullNameGenitive'),'checked');assert.equal(status(result,'phone'),'optional');
 assert(result.warnings.some(item=>item.code==='EXTERNAL_VERIFICATION_NOT_PERFORMED'));
 assert(!result.fields.some(item=>['kpp','ogrn'].includes(item.field)));
 const bad=analyzeCounterparty({...fields,inn:'123',bik:'a',signerFullNameGenitive:''});
 assert.equal(status(bad,'inn'),'needs_input');assert.equal(status(bad,'signerFullNameGenitive'),'needs_input');assert(bad.errors.some(item=>item.code==='BANK_REQUISITE_INVALID'));
});
test('genitive mismatch and unsupported initials stay reviewable rather than rejecting documented forms',()=>{
 const mismatch=analyzeCounterparty({...fields,signerFullNameGenitive:'Ким Сергей Иванович',signerPositionGenitive:'Индивидуальный предприниматель'});
 assert.equal(status(mismatch,'signerFullNameGenitive'),'needs_review');assert.equal(status(mismatch,'signerPositionGenitive'),'needs_review');assert.equal(mismatch.errors.length,0);
 const initials=analyzeCounterparty({...fields,signerFullName:'Ким С.И.',signerFullNameGenitive:'Кима С.И.'});assert.equal(status(initials,'signerFullNameGenitive'),'needs_review');
 const invariant=analyzeCounterparty({...fields,signerFullName:'Долгих Сергей Иванович',signerFullNameGenitive:'Долгих Сергея Ивановича',fullName:'ИП Долгих Сергей Иванович'});assert.equal(status(invariant,'signerFullNameGenitive'),'checked');
});
test('source ambiguities require attention until manually resolved, multiple contacts are valid',()=>{
 const options={warnings:[{field:'bankName',code:'AMBIGUOUS_REQUISITE'}],provenance:{bankName:{source:'local_text'}}};
 assert.equal(status(analyzeCounterparty(fields,options),'bankName'),'needs_review');assert.equal(status(analyzeCounterparty(fields,{...options,manualChanges:{bankName:true}}),'bankName'),'checked');
 assert.equal(status(analyzeCounterparty(fields,{warnings:[{field:'signerFullNameGenitive',code:'AMBIGUOUS_REQUISITE'}]}),'signerFullNameGenitive'),'needs_review');
 const contacts=analyzeCounterparty({...fields,email:'Директор one@example.invalid\nБухгалтерия two@example.invalid',phone:'+7 (977) 777-77-77; +7 (978) 777-77-77'});assert.equal(status(contacts,'email'),'checked');assert.equal(status(contacts,'phone'),'checked');
 assert.equal(status(analyzeCounterparty({...fields,phone:'+1 555 111 2222'}),'phone'),'needs_review');
 assert.equal(status(analyzeCounterparty({...fields,signerFullName:'Иванов Иван Иванович'}),'signerFullName'),'needs_review');
 assert.doesNotThrow(()=>analyzeCounterparty({phone:123,signerFullNameGenitive:123}));
});
test('shared IP address remains visibly reviewable and blocks submission until both field values are confirmed',()=>{
 const shared=fillSharedIpAddress({fields:{...fields,postalAddress:''},warnings:[{field:'legalAddress',code:'ADDRESS_KIND_UNSPECIFIED',message:'Проверьте адрес.'}],provenance:{legalAddress:{source:'local_text',snippets:['Адрес: Тестовый адрес']}}});
 const checks=analyzeCounterparty(shared.fields,{warnings:shared.warnings,provenance:shared.provenance});
 assert.equal(status(checks,'legalAddress'),'needs_review');assert.equal(status(checks,'postalAddress'),'needs_review');
 const input={fields:shared.fields,warnings:shared.warnings,provenance:shared.provenance,supplier:'ip-test',date:'2026-10-06',paymentType:'prepayment',confirmed:true};
 let requests=0;
 const denied=guardDocumentSubmission(input,()=>requests++);assert.equal(denied.preflight.valid,false);assert.equal(requests,0);
 assert.equal(guardDocumentSubmission({...input,reviews:{legalAddress:shared.fields.legalAddress,postalAddress:shared.fields.postalAddress}},()=>requests++).preflight.valid,true);assert.equal(requests,1);
});

test('local extraction fills IP signer and supported genitives with derived provenance',async()=>{
 const result=await extractCard(Buffer.from('ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ\nКИМ СЕРГЕЙ ИВАНОВИЧ\nИНН 123456789047\nОГРНИП 312345678901230'),{extension:'pdf',adapters:{pdf:{command:process.execPath,args:['-e','process.stdout.write(require("node:fs").readFileSync(process.argv[1]))','{input}']}}});
 assert.equal(result.fields.signerFullName,'КИМ СЕРГЕЙ ИВАНОВИЧ');assert.equal(result.fields.signerFullNameGenitive,'Кима Сергея Ивановича');assert.equal(result.fields.signerPositionGenitive,'индивидуального предпринимателя');assert.equal(result.provenance.signerFullNameGenitive.requiresReview,false);
});
