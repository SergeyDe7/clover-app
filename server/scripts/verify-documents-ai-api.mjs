import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import XLSX from 'xlsx';
import {applyDocumentsSchema} from '../src/documents/schema.js';
import {createDocumentsRepository} from '../src/documents/repository.js';
import {createDocumentStorage} from '../src/documents/storage.js';
import {createDocumentsRouter} from '../src/documents/router.js';
import {DisabledAIProvider} from '../src/documents/providers.js';
import {createDocumentRuntime} from '../src/documents/runtime.js';
const textRtf=text=>Buffer.from('{\\rtf1\\ansi\\uc1 '+Array.from(text).map(char=>char==='\n'?'\\par ':char.charCodeAt(0)>127?`\\u${char.charCodeAt(0)}?`:char).join('')+'}');

const cardRtf=()=>textRtf('ИНН покупателя 123456789047\nБИК (основной): 044525593');

async function fixture(t, provider=new DisabledAIProvider(),documentConfig={}) {
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY, role TEXT NOT NULL) STRICT');
 const actors={admin:{id:'admin',role:'admin'},client:{id:'client',role:'client'},other:{id:'other',role:'client'},manager:{id:'manager',role:'manager'}};
 for(const actor of Object.values(actors))db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.role);
 applyDocumentsSchema(db);
 const repo=createDocumentsRepository(db);
 const storage=createDocumentStorage(mkdtempSync(path.join(tmpdir(),'clover-ai-test-')));
 const events=[];
 const app=express();app.use(express.json());
 app.use('/documents',createDocumentsRouter({enabled:true,repository:repo,storage,service:{},aiProvider:provider,
   config:{clientCreate:true,...documentConfig},clientLink:()=>({personalManagerId:'manager'}),findUser:id=>actors[id],audit:(_req,event,data)=>events.push({event,data}),
   authRequired:(req,res,next)=>{req.user=actors[req.headers['x-test-actor']];if(!req.user)return res.sendStatus(401);next();}}));
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
 const base=`http://127.0.0.1:${server.address().port}/documents`;
 t.after(()=>{server.close();db.close();});
 async function call(route,body,actor='admin') {const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'x-test-actor':actor,...(body===undefined||body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 async function upload(buffer=cardRtf(),name='card.rtf') {const form=new FormData();form.append('file',new Blob([buffer]),name);const response=await call('/clients/client/imports',form);assert.equal(response.status,201);return response.body;}
 return {db,storage,repo,events,call,upload};
}
const provider=extract=>({status:()=>({available:true,provider:'openai'}),extract});
const proposal=text=>({available:true,provider:'openai',proposals:[{field:'inn',value:'123456789047',evidence:text.trim()}]});

test('automatic AI default is admin-only, explicit and independent of unavailable provider',async t=>{
 const f=await fixture(t,new DisabledAIProvider(),{aiAutoRecognition:true,grants:{manager:['view']}});
 for(const actor of ['admin','client','manager']) {
  const result=await f.call('/clients/client/options',undefined,actor);assert.equal(result.status,200);
  assert.equal(result.body.ai.available,false);assert.equal(result.body.ai.autoRecognition,actor==='admin');
 }
 const off=await fixture(t);assert.equal((await off.call('/clients/client/options')).body.ai.autoRecognition,false);
 const string=await fixture(t,new DisabledAIProvider(),{aiAutoRecognition:'true'});assert.equal((await string.call('/clients/client/options')).body.ai.autoRecognition,false);
});

test('runtime requires both server flags, a key and a model independently of browser consent',async t=>{
 const f=await fixture(t);
 const env={CLOVER_DOCUMENTS_ENABLED:'true',CLOVER_DOCUMENTS_STORAGE_DIR:mkdtempSync(path.join(tmpdir(),'clover-ai-config-test-')),
  CLOVER_DOCUMENTS_AI_ENABLED:'true',CLOVER_DOCUMENTS_AI_EXTERNAL_CONSENT:'true',CLOVER_DOCUMENTS_AI_AUTO_RECOGNITION:'true',CLOVER_DOCUMENTS_AI_API_KEY:'synthetic-key',CLOVER_DOCUMENTS_AI_MODEL:'gpt-4.1-mini-2025-04-14'};
 const app=express();
 for(const [name,overrides] of Object.entries({ready:{},flag:{CLOVER_DOCUMENTS_AI_ENABLED:'false'},consent:{CLOVER_DOCUMENTS_AI_EXTERNAL_CONSENT:'false'},key:{CLOVER_DOCUMENTS_AI_API_KEY:''},model:{CLOVER_DOCUMENTS_AI_MODEL:''},autoOff:{CLOVER_DOCUMENTS_AI_AUTO_RECOGNITION:'false'},economy:{CLOVER_DOCUMENTS_AI_ONLY_WHEN_NEEDED:'true'},economyString:{CLOVER_DOCUMENTS_AI_ONLY_WHEN_NEEDED:'TRUE'}})){
  app.use(`/${name}`,createDocumentRuntime({db:f.db,env:{...env,...overrides},findUser:()=>({id:'client',role:'client'}),authRequired:(req,_res,next)=>{req.user={id:'admin',role:'admin'};next();}}));
 }
 const server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});t.after(()=>server.close());
 for(const name of ['ready','flag','consent','key','model','autoOff','economy','economyString']){
  const response=await fetch(`http://127.0.0.1:${server.address().port}/${name}/clients/client/options`);assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.ai.available,['ready','autoOff','economy','economyString'].includes(name));assert.equal(result.ai.autoRecognition,['ready','key','model','economy','economyString'].includes(name));assert.equal(JSON.stringify(result).includes('synthetic-key'),false);assert.equal(result.ai.onlyWhenNeeded,name==='economy');
 }
});

test('AI endpoint requires separate consent, ownership, enabled provider and successful local import',async t=>{
 let calls=0;const f=await fixture(t,provider(async text=>{calls++;return proposal(text);}));const imported=await f.upload();
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{})).status,400);
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:false})).status,400);
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true},'other')).status,403);
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true},'manager')).status,403);
 assert.equal(calls,0);
 const disabled=await fixture(t);const local=await disabled.upload();
 assert.equal((await disabled.call(`/imports/${local.id}/ai`,{consent:true})).status,503);
});
test('one request is grounded, persisted, cached and omitted from import internals without changing document numbering',async t=>{
 let calls=0;const f=await fixture(t,provider(async text=>{calls++;return proposal(text);}));const imported=await f.upload();
 const result=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(result.status,200);assert.equal(result.body.id,imported.id);
 assert.equal(result.body.fields.inn,'123456789047');assert.ok(result.body.warnings.some(w=>w.field==='inn'&&w.code==='AI_SOURCE_REVIEW'));
 const cached=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(cached.body.fromCache,true);assert.equal(calls,1);
 const raw=await f.call(`/imports/${imported.id}`);assert.equal(raw.body.aiAttempts,undefined);assert.equal(f.repo.listDocuments('client').length,0);
 assert.ok(f.repo.getImport(imported.id).result.aiAttempts.document.state==='completed');
 assert.equal(JSON.stringify(f.events).includes('123456789047'),false);
});
test('concurrent and previously reserved attempts never send the card twice',async t=>{
 let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const f=await fixture(t,provider(async text=>{calls++;await gate;return proposal(text);}));const imported=await f.upload();
 const first=f.call(`/imports/${imported.id}/ai`,{consent:true});
 for(let n=0;n<100&&!calls;n++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(calls,1);assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true})).status,409);
 release();assert.equal((await first).status,200);assert.equal(calls,1);
 const reserved=await f.upload();f.repo.reserveImportAI({id:reserved.id,sourceKey:'document'});
 assert.equal((await f.call(`/imports/${reserved.id}/ai`,{consent:true})).status,409);assert.equal(calls,1);
});
test('only selected Excel sheet is sent and sheet identity is not substituted for import id',async t=>{
 const sent=[];const f=await fixture(t,provider(async text=>{sent.push(text);return {available:true,provider:'openai',proposals:[]};}));
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([]),'Empty');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['First card','FIRST_ONLY'],['БИК (основной):','044525593']]),'First');
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Second card','SECOND_ONLY'],['БИК (основной):','044525593']]),'Second');
 const imported=await f.upload(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'cards.xlsx');
 assert.ok(imported.alternatives.every(item=>item.aiNeed.needed&&item.aiNeed.fields.includes('bik')));
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true})).status,422);
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true,sheetId:'sheet-99'})).status,422);
 const selected=await f.call(`/imports/${imported.id}/ai`,{consent:true,sheetId:'sheet-1'});assert.equal(selected.status,200);assert.equal(selected.body.id,imported.id);
 assert.equal(sent.length,1);assert.ok(sent[0].includes('SECOND_ONLY'));assert.equal(sent[0].includes('FIRST_ONLY'),false);
});
test('safe fallback is cached, local data retained and provider diagnostics are not returned',async t=>{
 let calls=0;const f=await fixture(t,provider(async()=>{calls++;throw new Error('PRIVATE_API_KEY_SECRET');}));const imported=await f.upload();
 const result=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(result.status,200);assert.equal(result.body.ai.status,'fallback');
 assert.deepEqual(result.body.fields,imported.fields);assert.equal(JSON.stringify(result.body).includes('PRIVATE_API_KEY_SECRET'),false);
 await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(calls,1);
});
test('actor call limit covers multiple imports and failed model attempts',async t=>{
 let calls=0;const f=await fixture(t,provider(async()=>{calls++;throw new Error('unavailable');}));
 for(let n=0;n<4;n++){const imported=await f.upload();const result=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(result.status,n===3?429:200);}
 assert.equal(calls,3);
});

const completeText=`Наименование: ИП Иванов Иван Иванович
ИНН 123456789047
ОГРНИП 123456789012345
Адрес: г. Москва, ул. Лесная, д. 1
Банк: АО Банк
БИК 044525593
р/с 40802810000000000001
к/с 30101810000000000001`;
test('server skips complete, irrecoverable and ambiguity-only cards without reserving or consuming rate budget',async t=>{
 let calls=0;const f=await fixture(t,provider(async text=>{calls++;return proposal(text);}),{aiOnlyWhenNeeded:true});
 const texts=[completeText,'ИНН 123456789047','БИК 044525593\nБИК 044525594'];
 for(const text of texts){
  const imported=await f.upload(textRtf(text));assert.equal(imported.aiNeed.needed,false);
  for(let n=0;n<4;n++){
   const response=await f.call(`/imports/${imported.id}/ai`,{consent:true});
   assert.equal(response.status,200);assert.equal(response.body.ai.status,'skipped');
  }
  assert.equal(f.repo.getImport(imported.id).result.aiAttempts,undefined);
 }
 assert.equal(calls,0);
 const incomplete=await f.upload();assert.equal(incomplete.aiNeed.needed,true);
 assert.equal((await f.call(`/imports/${incomplete.id}/ai`,{consent:true})).status,200);
 assert.equal(calls,1);
});

test('persisted or browser hints never authorize an otherwise unnecessary external call',async t=>{
 let calls=0;const f=await fixture(t,provider(async()=>{calls++;return {available:true,provider:'openai',proposals:[]};}),{aiOnlyWhenNeeded:true});
 const imported=await f.upload(textRtf(completeText));
 f.db.prepare('UPDATE document_imports SET result_json=? WHERE id=?').run(JSON.stringify({...f.repo.getImport(imported.id).result,fields:{},aiNeed:{needed:true,fields:['bik'],sourceFields:['bik']}}),imported.id);
 const response=await f.call(`/imports/${imported.id}/ai`,{consent:true});
 assert.equal(response.status,200);assert.equal(response.body.ai.status,'skipped');assert.equal(response.body.aiNeed.reason,'LOCAL_FACTS_COMPLETE');
 assert.equal((await f.call(`/imports/${imported.id}/ai`,{consent:true,force:true})).status,400);
 assert.equal(calls,0);
});

test('economy mode is opt-in and false or string flags preserve full-card AI with cached retries',async t=>{
 for(const flag of [undefined,false,'true']){
  let calls=0;const f=await fixture(t,provider(async()=>{calls++;return {available:true,provider:'openai',proposals:[]};}),{aiOnlyWhenNeeded:flag});
  const options=await f.call('/clients/client/options');assert.equal(options.body.ai.onlyWhenNeeded,false);
  const imported=await f.upload(textRtf(completeText));assert.equal(imported.aiNeed.needed,false);
  const response=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(response.status,200);assert.notEqual(response.body.ai.status,'skipped');
  const cached=await f.call(`/imports/${imported.id}/ai`,{consent:true});assert.equal(cached.body.fromCache,true);assert.equal(calls,1);
 }
});
