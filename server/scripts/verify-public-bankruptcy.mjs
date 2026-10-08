import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../src/documents/publicBankruptcy.js',import.meta.url),'utf8');
const helper=new URL('../../src/shared/contracts/requisiteChecks.js',import.meta.url).href;
const {createPublicBankruptcyAdapter}=await import('data:text/javascript;base64,'+Buffer.from(src.replace('../../../src/shared/contracts/requisiteChecks.js',helper)).toString('base64'));
const input={inn:'500100732259',type:'ip'};
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const run=(data,options={})=>createPublicBankruptcyAdapter({fetchImpl:async()=>response(data),...options})(input);
let calls=0;
let result=await createPublicBankruptcyAdapter({fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://bankrot.fedresurs.ru/backend/prsnbankrupts?searchString=500100732259&limit=15&offset=0');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.deepEqual(Object.keys(options.headers),['Accept']);return response({pageData:[],total:0});}})({...input,url:'https://evil.invalid'});
assert.equal(result.status,'checked');assert.equal(result.total,0);assert.equal(calls,1);
const item={inn:input.inn,guid:'12345678-1234-1234-1234-123456789abc',fio:'Тестовый Контрагент'};
result=await run({pageData:[item],total:20});assert.equal(result.status,'checked');assert.equal(result.total,20);assert.equal(result.records.length,1);assert.match(result.records[0].evidence,/500100732259/);
for(const data of [{},{pageData:[],total:1},{pageData:[item],total:0},{pageData:[],total:'0'},{pageData:[],total:-1},{pageData:[{...item,inn:'123'}],total:1},{pageData:[{...item,guid:'../evil'}],total:1},{pageData:[{...item,fio:undefined}],total:1},{pageData:[item,item],total:2},{pageData:Array(16).fill(item),total:16}]){
 result=await run(data);assert.equal(result.status,'unavailable');assert.equal(result.total,undefined);
}
for(const status of [403,451,429]){result=await createPublicBankruptcyAdapter({fetchImpl:async()=>new Response('captcha',{status})})(input);assert.equal(result.code,'PUBLIC_BANKRUPTCY_BLOCKED');}
result=await createPublicBankruptcyAdapter({fetchImpl:async()=>new Response('<html>CAPTCHA</html>',{headers:{'Content-Type':'text/html'}})})(input);assert.equal(result.code,'PUBLIC_BANKRUPTCY_INVALID');
result=await createPublicBankruptcyAdapter({fetchImpl:async()=>new Response('x'.repeat(262145),{headers:{'Content-Type':'application/json'}})})(input);assert.equal(result.code,'PUBLIC_BANKRUPTCY_INVALID');
result=await createPublicBankruptcyAdapter({fetchImpl:async()=>new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'262145'}})})(input);assert.equal(result.code,'PUBLIC_BANKRUPTCY_INVALID');
result=await createPublicBankruptcyAdapter({fetchImpl:async()=>new Promise(()=>{}),timeoutMs:15})(input);assert.equal(result.code,'PUBLIC_BANKRUPTCY_TIMEOUT');
const abort=new AbortController();const pending=createPublicBankruptcyAdapter({fetchImpl:async()=>new Promise(()=>{})})(input,{signal:abort.signal});abort.abort();assert.equal((await pending).code,'PUBLIC_BANKRUPTCY_BLOCKED');
calls=0;result=await createPublicBankruptcyAdapter({fetchImpl:async()=>{calls++;}})({inn:'000000000000',type:'ip'});assert.equal(result.code,'PUBLIC_BANKRUPTCY_INVALID');assert.equal(calls,0);
const org={inn:'7707083893',type:'ooo'};
result=await createPublicBankruptcyAdapter({fetchImpl:async url=>{assert.match(url,/cmpbankrupts/);return response({pageData:[{inn:org.inn,guid:item.guid,name:'Тестовая организация'}],total:1});}})(org);assert.equal(result.status,'checked');
console.log('PUBLIC_BANKRUPTCY_TESTS PASS: fixed endpoint, identity, zero, positive, pagination, shape, challenge, bounds, timeout, abort, IP/OOO; synthetic only');

