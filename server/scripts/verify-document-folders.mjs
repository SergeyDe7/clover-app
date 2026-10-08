import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import sharp from 'sharp';
import {applyDocumentsSchema} from '../src/documents/schema.js';
import {createDocumentsRepository} from '../src/documents/repository.js';
import {createDocumentStorage} from '../src/documents/storage.js';
import {createDocumentService} from '../src/documents/service.js';
import {createDocumentsRouter} from '../src/documents/router.js';
const python=process.env.CLOVER_TEST_PYTHON||(process.platform==='win32'?'C:/Users/Lonovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe':'python3');
async function environment() {
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT');
 const actors={admin:{id:'admin',role:'admin'},client:{id:'client',role:'client'},other:{id:'other',role:'client'},manager:{id:'manager',role:'manager'}};
 for(const actor of Object.values(actors))db.prepare('INSERT INTO users VALUES(?,?)').run(actor.id,actor.role);
 applyDocumentsSchema(db);const repo=createDocumentsRepository(db);repo.createLegalEntity({id:'supplier',name:'Synthetic supplier'});repo.configureSequence({nextNumber:255});
 const root=mkdtempSync(path.join(tmpdir(),'clover-folders-'));const storage=createDocumentStorage(root);
 const service=createDocumentService({repository:repo,storage,converter:{available:false}});
 const app=express();app.use(express.json());app.use('/api/documents',createDocumentsRouter({enabled:true,repository:repo,storage,service,authRequired:(req,res,next)=>{req.user=actors[req.headers['x-actor']];if(!req.user)return res.status(401).end();next();},findUser:id=>actors[id],config:{fileValidatorPython:python}}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
 const form=({folder,key='import',clientId}={})=>{const f=new FormData();for(const [name,value]of Object.entries({folder,idempotencyKey:key,clientId,legalEntityId:'supplier',number:'historical-'+key,counterparty:JSON.stringify({fullName:'Synthetic historical party'}),signed:'true'}))if(value!==undefined)f.append(name,value);f.append('file',new Blob([png]),'signed.png');return f;};
 const request=(url,actor='admin',body)=>fetch(`http://127.0.0.1:${server.address().port}/api/documents${url}`,{method:body?'POST':'GET',headers:{'x-actor':actor},body});
 return {db,repo,root,storage,png,form,request,async close(){await new Promise(resolve=>server.close(resolve));db.close();}};
}

test('all three archive folders persist, serialize and retry without duplicates or number allocation',async()=>{
 const env=await environment();try{
  for(const folder of ['clients','suppliers','other']) {
   const payload={folder,key:folder};const created=await env.request('/admin/archive-import','admin',env.form(payload));assert.equal(created.status,201,await created.clone().text());const doc=(await created.json()).document;
   assert.equal(doc.folder,folder);assert.equal(env.repo.getDocument(doc.id).draftData.folder,folder);const files=readdirSync(env.root);
   const retry=await env.request('/admin/archive-import','admin',env.form(payload));assert.equal(retry.status,201);assert.equal((await retry.json()).document.id,doc.id);assert.deepEqual(readdirSync(env.root),files);
   const conflict=await env.request('/admin/archive-import','admin',env.form({...payload,folder:folder==='other'?'clients':'other'}));assert.equal(conflict.status,409);assert.deepEqual(readdirSync(env.root),files);
   assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,200);
  }
  const docs=(await (await env.request('/archive')).json()).documents;assert.deepEqual(docs.map(d=>d.folder).sort(),['clients','other','suppliers']);assert.equal(env.repo.getSequence().next_number,255);
 }finally{await env.close();}
});

test('legacy metadata defaults to clients and retries normalize omitted and explicit default folder',async()=>{
 const env=await environment();try{
  const file=env.storage.put(env.png,'png'),metadata={counterparty:{fullName:'Synthetic historical party'},historicalNumber:'historical-legacy',signed:true,sha256:file.sha256};
  env.db.prepare('INSERT INTO document_archive_entries(id,client_id,entity_id,actor_id,historical_number,metadata_json,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run('legacy',null,'supplier','admin',metadata.historicalNumber,JSON.stringify(metadata),'legacy',new Date().toISOString());
  env.db.prepare('INSERT INTO document_archive_files VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy-file','legacy','signed',file.key,'signed.png','image/png',file.size,file.sha256,'admin',new Date().toISOString());
  for(const folder of [undefined,'clients']) {const retry=await env.request('/admin/archive-import','admin',env.form({key:'legacy',folder}));assert.equal(retry.status,201);assert.equal((await retry.json()).document.folder,'clients');}
  assert.equal((await env.request('/admin/archive-import','admin',env.form({key:'legacy',folder:'suppliers'}))).status,409);assert.equal(env.db.prepare('SELECT COUNT(*) n FROM document_archive_entries').get().n,1);assert.equal(readdirSync(env.root).length,1);
  const omitted=await env.request('/admin/archive-import','admin',env.form({key:'default-new'}));assert.equal(omitted.status,201);assert.equal((await omitted.json()).document.folder,'clients');
 }finally{await env.close();}
});

test('invalid folders cannot write files or grant historical download access',async()=>{
 const env=await environment();try{
  for(const folder of ['wrong','Clients','../other','']) {const response=await env.request('/admin/archive-import','admin',env.form({folder,key:'invalid-'+folder}));assert.equal(response.status,400);assert.equal(readdirSync(env.root).length,0);}
  const created=await env.request('/admin/archive-import','admin',env.form({folder:'suppliers',key:'acl'}));const doc=(await created.json()).document;
  for(const actor of ['client','other','manager']) {assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`,actor)).status,403);assert.equal((await env.request('/admin/archive-import',actor,env.form({folder:'other',key:'forbidden-'+actor}))).status,403);}
  assert.equal(readdirSync(env.root).length,1);
  await assert.rejects(async()=>env.repo.importArchivedDocument({entityId:'supplier',number:'bad',counterparty:{fullName:'Synthetic'},actorId:'admin',idempotencyKey:'repository-bad',folder:'wrong',file:{}}),{code:'DOCUMENT_FOLDER_INVALID',status:400});
 }finally{await env.close();}
});

test('generated contracts always belong to clients and archive trash retains its original folder',async()=>{
 const env=await environment();try{
  const generated=env.repo.createDraft({clientId:null,entityId:'supplier',actorId:'admin',idempotencyKey:'draft',payment:{type:'prepayment'},counterparty:{fullName:'Synthetic buyer'},date:'2026-10-08'});assert.equal(generated.folder,'clients');
  const created=await env.request('/admin/archive-import','admin',env.form({folder:'other',key:'trash'}));const doc=(await created.json()).document;env.repo.trashDocument({documentId:doc.id,actorId:'admin'});
  assert.equal(env.repo.listTrashedDocuments().find(d=>d.id===doc.id).folder,'other');
  const listed=(await (await env.request('/archive')).json()).documents;assert.equal(listed.find(d=>d.id===generated.id).folder,'clients');assert(!listed.some(d=>d.id===doc.id));
 }finally{await env.close();}
});
