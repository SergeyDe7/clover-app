import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const candidate=readFileSync(new URL('../src/documents/fnsRegistry.js',import.meta.url),'utf8').replace('../../../src/shared/contracts/requisiteChecks.js',new URL('../../src/shared/contracts/requisiteChecks.js',import.meta.url).href);
const {createFnsRegistryAdapter}=await import('data:text/javascript,'+encodeURIComponent(candidate));
const ip={i:'470422791518',k:'fl',n:'SYNTHETIC IP',o:'326470400103966',cnt:'1',tot:'1',pg:'1'};
const ul={i:'7813676246',k:'ul',n:'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ТЕСТ"',o:'1237800131304',p:'781301001',cnt:'1',tot:'1',pg:'1'};
const service={k:'sprav-fl',cnt:'0',tot:'0',t:'SYNTHETIC_TOKEN'};
async function lookup(rows,row=ip) {
 const responses=['html',{t:'QUERY',captchaRequired:false},{rows}];let calls=0;
 const fetchImpl=async()=>new Response(typeof responses[calls]==='string'?responses[calls++]:JSON.stringify(responses[calls++]),{status:200});
 return createFnsRegistryAdapter({fetchImpl,now:()=>Date.parse('2026-10-08T00:00:00Z')})({inn:row.i,type:row.k==='fl'?'ip':'ooo'});
}
test('unique registry record plus only known empty service rows is checked',async()=>{
 assert.equal((await lookup([ip,service])).status,'checked');
 assert.equal((await lookup([service,ip,{k:'sprav-ul',cnt:0,tot:0,pg:1}])).status,'checked');
 assert.equal((await lookup([ul,{...service,k:'sprav-ul'}],ul)).status,'partial');
});
test('strict real row totals, page, duplicate and multiple records remain ambiguous',async()=>{
 for(const row of [{...ip,cnt:'2'},{...ip,tot:'2'},{...ip,pg:'2'}])assert.equal((await lookup([row,service])).status,'ambiguous');
 assert.equal((await lookup([ip,ip,service])).status,'ambiguous');
 assert.equal((await lookup([ip,{...ip,i:ul.i},service])).status,'ambiguous');
});
test('service rows with identities, nonzero totals, malformed metadata or unknown kinds are never ignored',async()=>{
 for(const bad of [{...service,i:''},{...service,n:ip.n},{...service,o:ip.o},{...service,cnt:'1'},{...service,tot:'1'},{...service,pg:'0'},{...service,t:'../evil'},{...service,e:'09.09.2026'},{...service,extra:true},null,[],{...service,k:'sprav-unknown'}]) {
  const result=await lookup([ip,bad]);assert.notEqual(result.status,'checked');assert.notEqual(result.status,'partial');
 }
 assert.equal((await lookup([service])).code,'FNS_NOT_FOUND');
});
test('termination date evidence is optional, calendar-valid and never inferred active or accepted from future',async()=>{
 const result=await lookup([{...ip,e:'09.09.2026'},service]);assert.deepEqual(result.registryDetails,{registrationStatus:'terminated',terminationDate:'2026-09-09',terminationDateEvidence:'09.09.2026'});
 for(const e of [undefined,'','31.02.2026','2026-09-09','09.09.2099'])assert.equal((await lookup([{...ip,...(e===undefined?{}:{e})},service])).registryDetails,undefined);
});
