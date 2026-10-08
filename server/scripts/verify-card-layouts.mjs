import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {recognizeFields,extractCard}from'../src/documents/extraction.js';
import {analyzeCounterparty}from'../../src/shared/contracts/requisiteChecks.js';
import AdmZip from 'adm-zip';
import {fillSharedIpAddress}from'../../src/shared/contracts/ipAddress.js';
test('alternative label wording and dotted account labels preserve every supplied digit',()=>{
 const card=recognizeFields('Наименование организации: Индивидуальный предприниматель Ким Сергей Иванович\nИНН организации: 123456789047\nОГРН 312345678901230\nНомер расчётного счёта: 11111111111111111111\nБИК Банка: 123456789\nК.с: 22222222222222222222');
 assert.equal(card.fields.inn,'123456789047');assert.equal(card.fields.ogrnip,'312345678901230');assert.equal(card.fields.settlementAccount,'1'.repeat(20));assert.equal(card.fields.correspondentAccount,'2'.repeat(20));assert.equal(card.fields.bik,'123456789');assert(card.warnings.some(item=>item.code==='REGISTRATION_LABEL_MISMATCH'));
 assert.equal(recognizeFields('ОГРН 312345678901230').fields.ogrnip,undefined);
 assert.equal(recognizeFields('ИП Ким Сергей Иванович\nООО «Пример»\nОГРН 312345678901230').fields.ogrnip,undefined);
 const checked=analyzeCounterparty(card.fields,{warnings:card.warnings});assert.equal(checked.fields.find(item=>item.field==='ogrnip').status,'needs_review');
 const corrected=analyzeCounterparty(card.fields,{warnings:card.warnings,manualChanges:{ogrnip:true}});assert.equal(corrected.fields.find(item=>item.field==='ogrnip').status,'checked');
 assert.equal(recognizeFields('Р.с: 11111111111111111111\nР.с: 22222222222222222222').fields.settlementAccount,undefined);
});
test('split company heading and municipal address lines stop at banking requisites',()=>{
 const card=recognizeFields('Общество с ограниченной ответственностью\n«Пример»\nАдрес местонахождения:\nг. ПРИМЕР,\nВН.ТЕР.Г. МУНИЦИПАЛЬНЫЙ ОКРУГ ТЕСТОВЫЙ,\nУЛ. ПРИМЕРНАЯ, Д. 1\nОГРН: 1123456789012\nР.с: 11111111111111111111');
 assert.equal(card.fields.fullName,'Общество с ограниченной ответственностью «Пример»');assert.equal(card.fields.legalAddress,'г. ПРИМЕР, ВН.ТЕР.Г. МУНИЦИПАЛЬНЫЙ ОКРУГ ТЕСТОВЫЙ, УЛ. ПРИМЕРНАЯ, Д. 1');assert(!card.fields.legalAddress.includes('ОГРН'));
});
test('split bank headings remain banks and explicit customer sections reset banking scope',()=>{
 const banking='Банковские реквизиты:\nООО\n«Примербанк»\nБИК 123456789';
 const withBuyer=recognizeFields(`ООО «Проверочный клиент»\n${banking}`);assert.equal(withBuyer.fields.fullName,'ООО «Проверочный клиент»');assert.equal(withBuyer.fields.bankName,'ООО «Примербанк»');
 assert.equal(recognizeFields(banking).fields.fullName,undefined);
 const nextBuyer=recognizeFields(`${banking}\nНаименование организации:\nОбщество с ограниченной ответственностью\n«Следующий клиент»`);assert.equal(nextBuyer.fields.fullName,'Общество с ограниченной ответственностью «Следующий клиент»');
 for(const label of ['Полное название','Полное название организации','Полное название предприятия','Полное наименование','Полное наименование организации','Полное наименование предприятия','Наименование','Наименование организации','Наименование предприятия']) {
  const reset=recognizeFields(`${banking}\n${label}:\nООО\n«Следующий клиент»`);assert.equal(reset.fields.fullName,'ООО «Следующий клиент»',label);assert.equal(reset.fields.bankName,'ООО «Примербанк»',label);
 }
});
test('Excel preserves multiline cells and offers explicit independent sheets instead of guessing an entity',async()=>{
 const book=XLSX.utils.book_new();
 for(const [name,fullName,inn,reg,account]of [['Организация','ООО Пример','1234567894',['ОГРН','1123456789012'],'1'],['Предприниматель','ИП Ким Сергей Иванович','123456789047',['ОГРНИП','312345678901230'],'2']]) {
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Полное наименование предприятия',fullName],['Сокращенное наименование','Тестовый бренд'],['ИНН/КПП',`ИНН ${inn}`],reg,['Адрес юридический','г. Пример, д. 1'],['Адрес фактический','г. Пример, д. 2'],['Телефон/факс','+79777777777'],['Банковские реквизиты',`Банк: ООО "Тестовый банк"\nНомер счёта: ${account.repeat(20)}\nБИК банка: 123456789\nКорреспондентский счёт: ${'3'.repeat(20)}`]]),name);
 }
 const result=await extractCard(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{extension:'xlsx'});
 assert.equal(result.fields.fullName,undefined);assert.equal(result.fields.inn,undefined);assert.equal(result.fields.settlementAccount,undefined);assert.equal(result.alternatives.length,2);
 assert.equal(result.alternatives[0].fields.fullName,'ООО Пример');assert.equal(result.alternatives[0].fields.settlementAccount,'1'.repeat(20));assert.equal(result.alternatives[1].fields.fullName,'ИП Ким Сергей Иванович');assert.equal(result.alternatives[1].fields.legalAddress,'г. Пример, д. 1');assert.equal(result.alternatives[1].fields.postalAddress,'г. Пример, д. 2');assert.equal(result.alternatives[1].fields.signerFullNameGenitive,'Кима Сергея Ивановича');assert.equal(result.alternatives[1].fields.bankName,'ООО "Тестовый банк"');assert.equal(result.alternatives[1].fields.phone,'+7 (977) 777-77-77');
});
test('IP registration-address labels preserve multiline source and enable the shared-address review',async()=>{
 const address='г. Тестовый, ул. Примерная, д. 12, корпус 3, кв. 4';
 for(const label of ['зарегистрирован по адресу','зарегистрирована по адресу','зарегистрирован(а) по адресу','Адрес регистрации','Адрес места жительства','Место жительства']) {
  const paragraphs=['ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ','Ким Сергей Иванович','ИП Ким Сергей Иванович',`${label}:`,'',address,'ИНН: 123456789047','ОГРНИП: 312345678901230','Расчётный счёт: 11111111111111111111','Банк: ТЕСТОВЫЙ БАНК','БИК банка: 123456789','Корсчёт: 22222222222222222222'];
  const zip=new AdmZip();zip.addFile('word/document.xml',Buffer.from(`<w:document>${paragraphs.map(value=>`<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`).join('')}</w:document>`));
  const result=await extractCard(zip.toBuffer(),{extension:'docx'});
  assert.equal(result.fields.legalAddress,address,label);assert.equal(result.fields.signerFullName,'Ким Сергей Иванович');
  assert.equal(result.fields.authorityBasis,undefined);
  assert.equal(result.provenance.legalAddress.snippets.length,1);assert(result.provenance.legalAddress.snippets[0].includes(`${label}:`));
  assert(!result.fields.legalAddress.includes('ИНН'));assert(!result.fields.legalAddress.includes('Банк'));
  const shared=fillSharedIpAddress(result);assert.equal(shared.fields.postalAddress,address,label);assert(shared.warnings.some(item=>item.code==='IP_SHARED_ADDRESS_REVIEW'));
 }
});
test('registration address does not replace explicit postal address or resolve competing legal addresses',()=>{
 const base='ИП Ким Сергей Иванович\nИНН: 123456789047\nОГРНИП: 312345678901230';
 const explicit=fillSharedIpAddress(recognizeFields(`${base}\nЗарегистрирован по адресу: г. Тестовый, д. 1\nПочтовый адрес: г. Тестовый, д. 2`));
 assert.equal(explicit.fields.legalAddress,'г. Тестовый, д. 1');assert.equal(explicit.fields.postalAddress,'г. Тестовый, д. 2');
 const competing=fillSharedIpAddress(recognizeFields(`${base}\nЗарегистрирован по адресу: г. Тестовый, д. 1\nЮридический адрес: г. Другой, д. 2`));
 assert.equal(competing.fields.legalAddress,undefined);assert.equal(competing.fields.postalAddress,undefined);assert(competing.warnings.some(item=>item.code==='AMBIGUOUS_REQUISITE'&&item.field==='legalAddress'));
 assert.equal(recognizeFields('ООО «Пример»\nИНН: 1234567894\nДиректор Ким Сергей Иванович\nЗарегистрирован по адресу: г. Тестовый, д. 1').fields.legalAddress,undefined);
});
