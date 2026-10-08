import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/documents/counterpartyVerification.js',import.meta.url),'utf8').replace('../../../src/shared/contracts/requisiteChecks.js',new URL('../../src/shared/contracts/requisiteChecks.js',import.meta.url).href).replace('../../../src/shared/contracts/externalVerification.js',new URL('../../src/shared/contracts/externalVerification.js',import.meta.url).href);
const {verifyCounterpartySnapshot}=await import('data:text/javascript,'+encodeURIComponent(source));
const now=()=>Date.parse('2026-10-08T12:00:00Z');
const facts={type:'ip',inn:'470422791518',fullName:'SYNTHETIC IP',ogrnip:'326470400103966'};
const details={registrationStatus:'terminated',terminationDate:'2026-09-09',terminationDateEvidence:'09.09.2026'};
const response={status:'checked',identity:{inn:facts.inn,type:'ip'},facts,evidence:{type:'{"k":"fl"}',inn:facts.inn,fullName:facts.fullName,ogrnip:facts.ogrnip},source:{id:'fns',url:'https://egrul.nalog.ru/index.html',checkedAt:'2026-10-08T12:00:00.000Z'},registryDetails:details};
const verify=value=>verifyCounterpartySnapshot(facts,{adapters:{fns:async()=>value},now});
const terminated=report=>report.warnings.filter(w=>w.code==='FNS_REGISTRATION_TERMINATED');
test('trusted complete FNS result exposes termination evidence as warning without changing facts or blocking policy',async()=>{
 const report=await verify(response);assert.equal(report.sources[0].status,'checked');assert.equal(terminated(report).length,1);assert.equal(terminated(report)[0].terminationDate,'2026-09-09');assert.equal(terminated(report)[0].evidence,'09.09.2026');assert.deepEqual(report.sources[0].registryDetails,details);assert.equal(report.status,'partial');assert(!('blocking' in report));assert(!('blocked' in report));assert(report.warnings.some(w=>w.code==='VERIFICATION_LIMITED'));
});
test('invalid, inconsistent, absent, active and future termination metadata never yields warning',async()=>{
 for(const registryDetails of [undefined,null,{},[],{...details,registrationStatus:'active'},{...details,terminationDateEvidence:'08.09.2026'},{...details,terminationDate:'2026-02-31',terminationDateEvidence:'31.02.2026'},{...details,terminationDate:'2099-09-09',terminationDateEvidence:'09.09.2099'},{...details,terminationDateEvidence:'09.09.2026\n<script>'}]) {
  const report=await verify({...response,registryDetails});assert.equal(terminated(report).length,0);assert.equal(report.sources[0].status,'checked');assert.equal(report.sources[0].registryDetails,undefined);
 }
});
test('untrusted source, unavailable result and invalid core fact cannot emit termination warning',async()=>{
 for(const value of [{...response,source:{...response.source,url:'https://untrusted.example'}},{...response,source:{...response.source,checkedAt:'2020-01-01T00:00:00Z'}},{...response,identity:{...response.identity,inn:'7813676246'}},{...response,status:'unavailable'},{...response,status:'ambiguous'},{...response,facts:{...facts,ogrnip:'123'}},{...response,evidence:{...response.evidence,fullName:'different name'}}]) {
  const report=await verify(value);assert.equal(terminated(report).length,0);assert.notEqual(report.sources[0].status,'checked');
 }
});

test('validated partial ООО core still preserves termination warning while address remains unconfirmed',async()=>{
 const facts={type:'ooo',inn:'7813676246',fullName:'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ТЕСТ"',ogrn:'1237800131304',kpp:'781301001'};
 const value={...response,status:'partial',identity:{inn:facts.inn,type:facts.type},facts,checkedFields:Object.keys(facts),missingFields:['legalAddress'],evidence:{...facts,type:JSON.stringify({k:'ul',n:facts.fullName})}};
 const report=await verifyCounterpartySnapshot(facts,{adapters:{fns:async()=>value},now});
 assert.equal(report.sources[0].status,'partial');assert.deepEqual(report.sources[0].missingFields,['legalAddress']);assert.equal(terminated(report).length,1);assert.deepEqual(report.sources[0].registryDetails,details);
});

test('fourth public bankruptcy source validates totals and returns honest pagination metadata',async()=>{
 const guid='11111111-2222-3333-4444-555555555555'; const record={id:guid,summary:'Synthetic public record — запись в поиске ЕФРСБ',evidence:JSON.stringify({inn:facts.inn,guid,fio:'Synthetic public record'}),url:'https://bankrot.fedresurs.ru/'};
 const value={status:'checked',identity:response.identity,source:{id:'bankruptcy',url:'https://bankrot.fedresurs.ru/backend/prsnbankrupts?limit=15&offset=0',checkedAt:response.source.checkedAt},records:[record],total:3};
 const report=await verifyCounterpartySnapshot(facts,{adapters:{fns:async()=>response,bankruptcy:async()=>value},now});
 assert.equal(report.sources.length,4);const source=report.sources.find(s=>s.id==='bankruptcy');assert.equal(source.status,'checked');assert.equal(source.total,3);assert.equal(source.returnedCount,1);assert.equal(source.recordsTruncated,true);assert(report.warnings.some(w=>w.code==='BANKRUPTCY_RECORDS_TRUNCATED'));assert.equal(report.sources.find(s=>s.id==='arbitration').status,'not_configured');assert.equal(report.sources.find(s=>s.id==='fssp').status,'not_configured');
 const empty=await verifyCounterpartySnapshot(facts,{adapters:{bankruptcy:async()=>({...value,records:[],total:0})},now});assert.equal(empty.sources.find(s=>s.id==='bankruptcy').total,0);assert.equal(empty.sources.find(s=>s.id==='bankruptcy').status,'checked');
 for(const records of [[],[record,record],[{...record,id:'bad-guid'}],[{...record,evidence:'not JSON'}],[{...record,evidence:JSON.stringify({inn:'7813676246',guid,fio:'Synthetic public record'})}],[{...record,evidence:JSON.stringify({inn:facts.inn,guid:'aaaaaaaa-2222-3333-4444-555555555555',fio:'Synthetic public record'})}],[{...record,evidence:JSON.stringify({inn:facts.inn,guid,fio:'Different name'})}]]) {const bad=await verifyCounterpartySnapshot(facts,{adapters:{bankruptcy:async()=>({...value,records})},now});assert.equal(bad.sources.find(s=>s.id==='bankruptcy').status,'unavailable');assert.equal(bad.sources.find(s=>s.id==='bankruptcy').total,undefined);}
 for(const total of [-1,0,1.5,Number.MAX_SAFE_INTEGER+1,undefined,'3']) {const bad=await verifyCounterpartySnapshot(facts,{adapters:{bankruptcy:async()=>({...value,total})},now});assert.equal(bad.sources.find(s=>s.id==='bankruptcy').status,'unavailable');assert.equal(bad.sources.find(s=>s.id==='bankruptcy').total,undefined);}
});
test('public bankruptcy failure codes remain unavailable without invented zero counts or untrusted URLs',async()=>{
 for(const code of ['PUBLIC_BANKRUPTCY_BLOCKED','PUBLIC_BANKRUPTCY_TIMEOUT','PUBLIC_BANKRUPTCY_INVALID']) {
  const report=await verifyCounterpartySnapshot(facts,{adapters:{bankruptcy:async()=>({status:'unavailable',code,records:[],total:0})},now});const source=report.sources.find(s=>s.id==='bankruptcy');assert.equal(source.code,code);assert.equal(source.status,'unavailable');assert.equal(source.total,undefined);
 }
 const bad={status:'checked',identity:response.identity,source:{id:'bankruptcy',url:'https://untrusted.example',checkedAt:response.source.checkedAt},records:[],total:0};
 const report=await verifyCounterpartySnapshot(facts,{adapters:{bankruptcy:async()=>bad},now});assert.equal(report.sources.find(s=>s.id==='bankruptcy').status,'unavailable');
});
