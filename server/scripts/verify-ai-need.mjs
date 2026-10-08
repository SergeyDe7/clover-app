import test from 'node:test';
import assert from 'node:assert/strict';
import {decideCardAINeed} from '../../src/shared/contracts/aiNeed.js';
const complete={type:'ip',fullName:'ИП Иванов Иван Иванович',inn:'123456789047',legalAddress:'г. Москва, ул. Лесная, д. 1',bankName:'АО Банк',bik:'044525593',settlementAccount:'40802810000000000001',correspondentAccount:'30101810000000000001',signerFullName:'Иванов Иван Иванович',signerPosition:'Индивидуальный предприниматель',ogrnip:'123456789012345'};
test('complete raw facts do not spend for missing optional contacts or genitives or validation errors',()=>{
 assert.equal(decideCardAINeed({fields:complete},'БИК 044525593').needed,false);
 assert.equal(decideCardAINeed({fields:complete,warnings:[{field:'inn',code:'INN_INVALID'},{field:'signerFullNameGenitive',code:'NAME_DECLENSION_UNRESOLVED'}]},'БИК 044525593').needed,false);
});
test('missing source facts are not invented; recoverable source cues trigger only relevant field',()=>{
 const fields={...complete,bik:''};
 assert.equal(decideCardAINeed({fields},'Только телефон: +7 999 123-45-67').needed,false);
 const result=decideCardAINeed({fields},'БИК (основной): 044525593');
 assert.equal(result.needed,true);assert.deepEqual(result.fields,['bik']);
 assert.equal(decideCardAINeed({fields},'БИК: отсутствует').needed,false);
});
test('ambiguous alternatives require person selection, never another paid guess',()=>{
 assert.equal(decideCardAINeed({fields:{...complete,bik:''},warnings:[{field:'bik',code:'AMBIGUOUS_REQUISITE'}]},'БИК 044525593; БИК 044525594').needed,false);
});
test('recoverable twelve-digit INN is accepted while bank headings cannot supply customer name',()=>{
 assert.deepEqual(decideCardAINeed({fields:{...complete,inn:''}},'ИНН (основной): 123456789047').fields,['inn']);
 assert.equal(decideCardAINeed({fields:{...complete,inn:''}},'ИНН (основной): 12345678904799').needed,false);
 assert.equal(decideCardAINeed({fields:{...complete,fullName:''}},'Наименование банка: АО Тест Банк').needed,false);
});
test('UI can reuse safe source field hints while backend original text overrides forged hints',()=>{
 const fields={...complete,bik:''};
 const aiNeed=decideCardAINeed({fields},'БИК (основной): 044525593');
 assert.equal(decideCardAINeed({fields,aiNeed}).needed,true);
 assert.equal(decideCardAINeed({fields,aiNeed},'Нет реквизитов').needed,false);
 assert.equal(JSON.stringify(aiNeed).includes('044525593'),false);
});
test('bank legal forms are not customer names; explicit customer label ends banking scope',()=>{
 const fields={...complete,fullName:''};
 for(const text of ['Наименование банка: ООО «Пример Банк»','Банк: ООО «Пример Банк»','Банковские реквизиты:\nООО «Пример Банк»\nБИК 044525593'])assert.equal(decideCardAINeed({fields},text).needed,false,text);
 assert.deepEqual(decideCardAINeed({fields},'Банковские реквизиты:\nООО «Пример Банк»\nНаименование организации: ООО «Покупатель»').fields,['fullName']);
 assert.deepEqual(decideCardAINeed({fields},'ООО «Покупатель»\nБанковские реквизиты:\nООО «Пример Банк»').fields,['fullName']);
});
