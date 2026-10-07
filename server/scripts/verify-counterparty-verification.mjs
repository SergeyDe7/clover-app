import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCounterparty} from '../src/documents/counterpartyVerification.js';
import {resolveVerificationChoice} from '../../src/shared/contracts/externalVerification.js';
const now=()=>Date.parse('2026-10-07T10:00:00Z');
const fields={type:'ooo',inn:'7707083893',fullName:'Название из карточки',legalAddress:''};
const registry={type:'ooo',inn:'7707083893',fullName:'ПАО Сбербанк',ogrn:'1027700132195',kpp:'773601001',legalAddress:'г. Москва, ул. Вавилова, д. 19'};
const fns=()=>({status:'checked',source:{id:'fns',url:'https://egrul.nalog.ru/',checkedAt:'2026-10-07T09:59:00Z'},identity:{type:'ooo',inn:'7707083893'},facts:{...registry},evidence:Object.fromEntries(Object.entries(registry).map(([field,value])=>[field,`Из реестра: ${value}`]))});

test('offline report states every source is unconfigured and never claims absence of records',async()=>{
 const report=await verifyCounterparty({fields,now});assert.equal(report.status,'unavailable');assert.equal(report.sources.length,3);assert.ok(report.sources.every(source=>source.status==='not_configured'));assert.deepEqual(report.comparisons,[]);
});
test('valid FNS proposes missing facts, exposes conflicts and does not modify supplied card',async()=>{
 const before=structuredClone(fields);let input;
 const report=await verifyCounterparty({fields,now,adapters:{fns:async(request)=>{input=request;return fns();}}});
 assert.deepEqual(fields,before);assert.ok(Object.isFrozen(input));assert.deepEqual(Object.keys(input),['inn','type']);
 assert.equal(report.status,'partial');assert.equal(report.sources[0].status,'checked');
 assert.equal(report.comparisons.find(item=>item.field==='inn').status,'match');
 assert.equal(report.comparisons.find(item=>item.field==='fullName').status,'choice');
 assert.equal(report.comparisons.find(item=>item.field==='legalAddress').status,'proposal');
 assert.equal(resolveVerificationChoice(report,'fullName','original').value,fields.fullName);
 assert.equal(resolveVerificationChoice(report,'fullName','registry').value,registry.fullName);
 assert.throws(()=>resolveVerificationChoice(report,'fullName','auto'));
});
test('forged origin, stale timestamp and wrong identity cannot produce registry proposals',async()=>{
 for(const mutate of [r=>{r.source.url='https://egrul.nalog.ru.evil.example/';},r=>{r.source.url='http://egrul.nalog.ru/';},r=>{r.source.url='https://key:secret@egrul.nalog.ru/';},r=>{r.source.checkedAt='2026-10-01T00:00:00Z';},r=>{r.source.checkedAt='2026-10-08T00:00:00Z';},r=>{r.identity.inn='123456789047';},r=>{r.identity.type='ip';}]){
  const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>{const response=fns();mutate(response);return response;}}});
  assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
 }
});
test('one invalid or forbidden fact rejects entire FNS result, including private IP address',async()=>{
 for(const mutate of [r=>{r.facts.bankName='BANK';r.evidence.bankName='BANK';},r=>{r.facts.inn='123456789047';},r=>{r.facts.kpp='bad';r.evidence.kpp='bad';},r=>{delete r.evidence.fullName;}]){
  const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>{const response=fns();mutate(response);return response;}}});assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
 }
 const ip={type:'ip',inn:'123456789047'};
 const response={...fns(),identity:ip,facts:{...ip,legalAddress:'Private residence'},evidence:{type:'ip',inn:ip.inn,legalAddress:'Private residence'}};
 const report=await verifyCounterparty({fields:ip,now,adapters:{fns:async()=>response}});assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
});
test('invalid INN makes no adapter calls; provider failures disclose no secrets',async()=>{
 let count=0;const adapters={fns:async()=>{count++;throw new Error('SECRET_KEY');}};
 assert.equal((await verifyCounterparty({fields:{...fields,inn:'7707083894'},now,adapters})).status,'invalid');assert.equal(count,0);
 const report=await verifyCounterparty({fields,now,adapters});assert.equal(count,1);assert.equal(report.sources[0].status,'unavailable');assert.equal(JSON.stringify(report).includes('SECRET_KEY'),false);
});
test('arbitration and enforcement records remain separate from requisites; ambiguity stays unresolved',async()=>{
 const report=await verifyCounterparty({fields,now,adapters:{arbitration:async()=>({status:'checked',source:{id:'arbitration',url:'https://kad.arbitr.ru/',checkedAt:'2026-10-07T09:59:00Z'},identity:{type:'ooo',inn:fields.inn},records:[{id:'A-123',summary:'Производство по делу',evidence:'Карточка дела',url:'https://kad.arbitr.ru/Card/123'}]}),fssp:async()=>({status:'ambiguous'})}});
 assert.deepEqual(report.comparisons,[]);assert.equal(report.sources[1].records.length,1);assert.equal(report.sources[2].status,'ambiguous');
});
test('adapter deadline aborts stalled source and returns bounded safe unavailable result',async()=>{
 let signal;const started=Date.now();
 const report=await verifyCounterparty({fields,now,adapters:{fns:(_input,options)=>{signal=options.signal;return new Promise(()=>{});}}});
 assert.ok(Date.now()-started<6500);assert.equal(signal.aborted,true);assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
});

test('incomplete FNS core cannot become checked even if supplied identity fields are valid',async()=>{
 for(const field of ['fullName','ogrn','kpp','legalAddress']){
  const response=fns();delete response.facts[field];
  const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>response}});
  assert.equal(report.sources[0].status,'unavailable');assert.equal(report.sources[0].code,'VERIFICATION_FACTS_INCOMPLETE');assert.deepEqual(report.comparisons,[]);
 }
 const response=fns();response.facts={type:fields.type,inn:fields.inn};
 const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>response}});assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
});
test('complete IP registration supports missing OGRNIP proposal without public residence address',async()=>{
 const ip={type:'ip',inn:'123456789047'};
 const registration={...ip,fullName:'Индивидуальный предприниматель Иванов Иван Иванович',ogrnip:'12345678901234'+String(BigInt('12345678901234')%13n%10n)};
 const response={status:'checked',source:{id:'fns',url:'https://egrul.nalog.ru/',checkedAt:'2026-10-07T09:59:00Z'},identity:ip,facts:registration,evidence:Object.fromEntries(Object.entries(registration).map(([field,value])=>[field,value]))};
 const report=await verifyCounterparty({fields:ip,now,adapters:{fns:async()=>response}});
 assert.equal(report.sources[0].status,'checked');assert.deepEqual(report.sources[0].checkedFields,Object.keys(registration));assert.equal(report.comparisons.find(item=>item.field==='ogrnip').status,'proposal');assert.equal(report.comparisons.some(item=>item.field==='legalAddress'),false);
 delete response.facts.ogrnip;
 const incomplete=await verifyCounterparty({fields:ip,now,adapters:{fns:async()=>response}});assert.equal(incomplete.sources[0].code,'VERIFICATION_FACTS_INCOMPLETE');assert.deepEqual(incomplete.comparisons,[]);
});

test('explicit partial FNS registration compares only confirmed fields and never invents address',async()=>{
 const response=fns();delete response.facts.legalAddress;delete response.evidence.legalAddress;
 response.status='partial';response.missingFields=['legalAddress'];response.checkedFields=Object.keys(response.facts);
 const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>response}});
 assert.equal(report.status,'partial');assert.equal(report.sources[0].status,'partial');
 assert.deepEqual(report.sources[0].missingFields,['legalAddress']);assert.equal(report.comparisons.some(row=>row.field==='legalAddress'),false);
 assert.equal(report.comparisons.find(row=>row.field==='ogrn').status,'proposal');
 for(const mutate of [r=>{delete r.facts.kpp;},r=>{r.missingFields=['kpp'];},r=>{r.checkedFields=['inn'];},r=>{r.checkedFields.push('inn');},r=>{r.facts.legalAddress='г. Москва';r.evidence.legalAddress='г. Москва';}]){
  const broken=structuredClone(response);mutate(broken);
  const invalid=await verifyCounterparty({fields,now,adapters:{fns:async()=>broken}});
  assert.equal(invalid.sources[0].status,'unavailable');assert.deepEqual(invalid.comparisons,[]);
 }
});
test('structural FNS type evidence uses fl or exact ООО legal form, never invented type quotation',async()=>{
 const ip={type:'ip',inn:'123456789047'};
 const facts={...ip,fullName:'Иванов Иван Иванович',ogrnip:'12345678901234'+String(BigInt('12345678901234')%13n%10n)};
 const response={status:'checked',source:{id:'fns',url:'https://egrul.nalog.ru/index.html',checkedAt:'2026-10-07T09:59:00Z'},identity:ip,facts,evidence:Object.fromEntries(Object.entries(facts).map(([key,value])=>[key,value]))};
 response.evidence.type=JSON.stringify({k:'fl'});
 assert.equal((await verifyCounterparty({fields:ip,now,adapters:{fns:async()=>response}})).sources[0].status,'checked');
 response.evidence.type=JSON.stringify({k:'ul'});
 assert.equal((await verifyCounterparty({fields:ip,now,adapters:{fns:async()=>response}})).sources[0].status,'unavailable');
 const company=fns();company.facts.fullName='ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ТЕСТ"';company.evidence.fullName=company.facts.fullName;
 company.evidence.type=JSON.stringify({k:'ul',n:company.facts.fullName});
 assert.equal((await verifyCounterparty({fields,now,adapters:{fns:async()=>company}})).sources[0].status,'checked');
 company.evidence.type=JSON.stringify({k:'ul',n:'ПАО ТЕСТ'});
 assert.equal((await verifyCounterparty({fields,now,adapters:{fns:async()=>company}})).sources[0].status,'unavailable');
});

test('captcha and timeout carry only allowlisted truthful messages and no proposals',async()=>{
 for(const code of ['FNS_CAPTCHA_REQUIRED','FNS_TIMEOUT','FNS_NOT_FOUND','SECRET_ERROR']){
  const report=await verifyCounterparty({fields,now,adapters:{fns:async()=>({status:'unavailable',code,message:'SECRET_MESSAGE'})}});
  assert.equal(report.sources[0].status,'unavailable');assert.deepEqual(report.comparisons,[]);
  assert.equal(JSON.stringify(report).includes('SECRET'),false);
  if(code!=='SECRET_ERROR')assert.equal(report.sources[0].code,code);
 }
});
