import assert from 'node:assert/strict';
import {createFNSRegistryAdapter} from '../src/documents/fnsRegistry.js';
const ip={i:'470422791518',k:'fl',n:'БАБАЕВ ФАТДА ХАНОГЛАН ОГЛЫ',o:'326470400103966',cnt:'1',tot:'1',pg:'1'};
const ul={i:'7813676246',k:'ul',n:'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МАНУФАКТУРА ФЕРРО"',o:'1237800131304',p:'781301001',rn:'Г.Санкт-Петербург',cnt:'1',tot:'1',pg:'1'};
const input={inn:ip.i,type:'ip'};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function mock(results,inspect=()=>{}){let calls=0;const fetchImpl=async(url,options)=>{inspect(url,options,calls);const item=results[Math.min(calls++,results.length-1)];if(item instanceof Error)throw item;return new Response(typeof item==='string'?item:JSON.stringify(item),{status:200,headers:{'set-cookie':'session=fixture; Path=/','content-type':'application/json'}});};return {fetchImpl,calls:()=>calls};}
const responses=row=>['html',{t:'TOKEN',captchaRequired:false},{rows:[row]}];
await test('IP core, source, request minimization and cookie',async()=>{const m=mock(responses(ip),(url,o,index)=>{assert.ok(url.startsWith('https://egrul.nalog.ru/'));assert.equal(o.redirect,'error');if(index===1){assert.equal(o.headers.Cookie,'session=fixture');assert.equal(new URLSearchParams(o.body).get('query'),ip.i);assert.equal(new URLSearchParams(o.body).size,4);}});const result=await createFNSRegistryAdapter(m)(input);assert.equal(result.status,'checked');assert.equal(result.facts.ogrnip,ip.o);assert.equal(JSON.parse(result.evidence.type).k,'fl');assert.equal(result.source.url,'https://egrul.nalog.ru/index.html');assert.ok(Number.isFinite(Date.parse(result.source.checkedAt)));});
await test('ООО partial never regional address/signer',async()=>{const r=await createFNSRegistryAdapter(mock(responses(ul)))({inn:ul.i,type:'ooo'});assert.equal(r.status,'partial');assert.deepEqual(r.missingFields,['legalAddress']);assert.equal(r.facts.legalAddress,undefined);assert.equal(r.facts.signerFullName,undefined);assert.deepEqual(r.checkedFields,['type','inn','fullName','ogrn','kpp']);});
await test('offline',async()=>assert.equal((await createFNSRegistryAdapter(mock([new Error('offline')]))(input)).status,'unavailable'));
await test('captcha no retry',async()=>{const m=mock(['html',{captchaRequired:true}]);assert.equal((await createFNSRegistryAdapter(m)(input)).code,'FNS_CAPTCHA_REQUIRED');assert.equal(m.calls(),2);});
await test('wait bounded',async()=>{const m=mock(['html',{t:'T',captchaRequired:false},{status:'wait'}]);assert.equal((await createFNSRegistryAdapter({...m,pollDelayMs:1})(input)).code,'FNS_TIMEOUT');assert.equal(m.calls(),14);});
await test('wait then result',async()=>assert.equal((await createFNSRegistryAdapter({...mock(['html',{t:'T',captchaRequired:false},{status:'wait'},{rows:[ip]}]),pollDelayMs:1})(input)).status,'checked'));
await test('wrong INN rejected',async()=>assert.equal((await createFNSRegistryAdapter(mock(responses({...ip,i:ul.i})))(input)).code,'FNS_IDENTITY_MISMATCH'));
await test('pagination ambiguity',async()=>assert.equal((await createFNSRegistryAdapter(mock(responses({...ip,tot:'2'})))(input)).status,'ambiguous'));
await test('multiple rows ambiguity',async()=>assert.equal((await createFNSRegistryAdapter(mock(['html',{t:'T',captchaRequired:false},{rows:[ip,ip]}]))(input)).status,'ambiguous'));
await test('unsupported legal form',async()=>assert.equal((await createFNSRegistryAdapter(mock(responses({...ul,n:'АКЦИОНЕРНОЕ ОБЩЕСТВО ФЕРРО'})))({inn:ul.i,type:'ooo'})).code,'FNS_TYPE_MISMATCH'));
await test('incomplete core',async()=>assert.equal((await createFNSRegistryAdapter(mock(responses({...ip,o:''})))(input)).status,'unavailable'));
await test('token path injection blocked',async()=>assert.equal((await createFNSRegistryAdapter(mock(['html',{t:'../evil',captchaRequired:false}]))(input)).code,'FNS_RESPONSE_INVALID'));
await test('response byte cap',async()=>assert.equal((await createFNSRegistryAdapter(mock(['x'.repeat(262145)]))(input)).status,'unavailable'));
await test('cache TTL, copy isolation and inflight dedup',async()=>{let time=1000;const m=mock([...responses(ip),...responses(ip)]);const a=createFNSRegistryAdapter({...m,now:()=>time,cacheTtlMs:10});const [r,s]=await Promise.all([a(input),a(input)]);assert.equal(m.calls(),3);r.facts.fullName='edited';assert.equal(s.facts.fullName,ip.n);assert.equal((await a(input)).facts.fullName,ip.n);time+=11;await a(input);assert.equal(m.calls(),6);});
await test('caller abort does not poison shared lookup',async()=>{const m=mock(responses(ip));const a=createFNSRegistryAdapter(m);const c=new AbortController();const first=a(input,{signal:c.signal});const second=a(input);c.abort();await assert.rejects(first);assert.equal((await second).status,'checked');assert.equal(m.calls(),3);});
await test('overall timeout',async()=>{const fetchImpl=(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));assert.equal((await createFNSRegistryAdapter({fetchImpl,timeoutMs:10})(input)).code,'FNS_TIMEOUT');});
await test('timeout even if transport ignores signal',async()=>assert.equal((await createFNSRegistryAdapter({fetchImpl:()=>new Promise(()=>{}),timeoutMs:10})(input)).code,'FNS_TIMEOUT'));
await test('invalid input no network',async()=>{const a=createFNSRegistryAdapter({fetchImpl:()=>{throw new Error('should not run');}});assert.equal((await a({inn:'123',type:'ip'})).code,'FNS_INPUT_INVALID');});
console.log(`${passed} FNS adapter checks passed`);
