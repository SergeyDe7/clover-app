import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import express from "express";
import AdmZip from "adm-zip";
import XLSX from "xlsx";
import { applyDocumentsSchema } from "../src/documents/schema.js";
import { createDocumentsRepository } from "../src/documents/repository.js";
import { createDocumentStorage } from "../src/documents/storage.js";
import { createDocumentService } from "../src/documents/service.js";
import { createDocumentsRouter } from "../src/documents/router.js";
import { createDocumentRuntime } from "../src/documents/runtime.js";
import { validInn } from "../src/documents/validation.js";
import { createDocumentsBackup, assertLegacyRestoreAllowed, assertClientDocumentDeletionAllowed } from "../src/documents/backup.js";
import { documentCapabilities } from "../src/documents/policy.js";
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import {deflateSync} from 'node:zlib';
import {readdirSync} from 'node:fs';
import {assertDocumentsSchemaReady,DOCUMENTS_SCHEMA_COLUMNS} from '../src/documents/schema.js';
import { validateSignedDocument } from '../src/documents/fileValidation.js';
import {filterSavedDocuments} from '../../src/shared/contracts/savedDocuments.js';
const python='C:/Users/Lonovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
async function pdf(){const doc=new PDFDocument();const chunks=[];doc.on('data',chunk=>chunks.push(chunk));const result=new Promise(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))));doc.text('Synthetic signed archive');doc.end();return result;}
function streamPdf(stream){const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',Buffer.concat([Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),stream,Buffer.from('\nendstream')])];let result=Buffer.from('%PDF-1.4\n');const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(result.length);result=Buffer.concat([result,Buffer.from(`${i+1} 0 obj\n`),Buffer.from(objects[i]),Buffer.from('\nendobj\n')]);}const xref=result.length;return Buffer.concat([result,Buffer.from(`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)]);}
async function archiveForm(overrides={}){const form=new FormData();const data={clientId:'client',legalEntityId:'supplier-ip',number:'История 255 / ABC',counterparty:JSON.stringify({type:'ooo',fullName:'ООО «Пример»',inn:counterparty('ooo').inn}),signed:'true',confirmed:'true',idempotencyKey:'archive-idempotency',...overrides};for(const [key,value] of Object.entries(data))if(key!=='file'&&value!==undefined)form.append(key,value);form.append('file',new Blob([overrides.file || await pdf()]),'signed.pdf');return form;}

test('simple historical import accepts only a name without INN, type or acknowledgment; optional data remains validated',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const bytes=await pdf(),fields={clientId:undefined,counterparty:JSON.stringify({fullName:'Пример исторического клиента'}),confirmed:undefined,file:bytes};
  const response=await env.request('/admin/archive-import','admin',await archiveForm(fields));assert.equal(response.status,201,await response.clone().text());const doc=(await response.json()).document;
  assert.deepEqual(doc.counterparty,{fullName:'Пример исторического клиента'});
  const retry=await env.request('/admin/archive-import','admin',await archiveForm(fields));assert.equal((await retry.json()).document.id,doc.id);
  const list=(await (await env.request('/archive')).json()).documents;assert.equal(filterSavedDocuments(list,'пример')[0].id,doc.id);
  assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,200);
  assert(env.audit.some(item=>item.event==='document.archive.import'&&item.details.signedDeclared===true));
  for(const partial of [{inn:'123'},{inn:'1111111111'},{type:'other'},{type:'ip',inn:counterparty('ooo').inn}]){
   const bad=await env.request('/admin/archive-import','admin',await archiveForm({...fields,idempotencyKey:JSON.stringify(partial),counterparty:JSON.stringify({fullName:'Пример',...partial})}));assert([400,422].includes(bad.status));
  }
  const onlyInn=await env.request('/admin/archive-import','admin',await archiveForm({...fields,idempotencyKey:'inn-only',counterparty:JSON.stringify({fullName:'Пример',inn:counterparty('ooo').inn})}));assert.equal(onlyInn.status,201);
  const onlyType=await env.request('/admin/archive-import','admin',await archiveForm({...fields,idempotencyKey:'type-only',counterparty:JSON.stringify({fullName:'Пример',type:'ip'})}));assert.equal(onlyType.status,201);
  const unconfirmed=await env.request('/admin/archive-import','admin',await archiveForm({...fields,confirmed:'false'}));assert.equal(unconfirmed.status,400);
  const draft=input('supplier-ip','ip');draft.counterparty={fullName:'Пример'};const invalidDraft=await env.request('/clients/client/drafts','admin',draft);assert.equal(invalidDraft.status,422);
 }finally{await env.close();}
});

test('signature-only files fail local structural validation; valid PDF/PNG pass; missing validator fails safe',async()=>{
 for(const [extension,bytes] of [['pdf',Buffer.from('%PDF-1.4')],['png',Buffer.from('89504e470d0a1a0a','hex')],['jpg',Buffer.from('ffd8ff','hex')]])await assert.rejects(validateSignedDocument(bytes,extension,{python}),{code:'DOCUMENT_FILE_UNREADABLE'});
 await validateSignedDocument(await pdf(),'pdf',{python});
 const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
 await validateSignedDocument(png,'png',{python});
 await validateSignedDocument(await sharp(png).jpeg().toBuffer(),'jpg',{python});
 await validateSignedDocument(streamPdf(deflateSync(Buffer.from('q Q'))),'pdf',{python});
 await assert.rejects(validateSignedDocument(streamPdf(Buffer.from('not-zlib')),'pdf',{python}),{code:'DOCUMENT_FILE_UNREADABLE'});
 await assert.rejects(validateSignedDocument(streamPdf(deflateSync(Buffer.alloc(17*1024*1024))),'pdf',{python}),{code:'DOCUMENT_FILE_UNREADABLE'});
 await assert.rejects(validateSignedDocument(await pdf(),'pdf',{}),{code:'DOCUMENT_FILE_VALIDATOR_UNAVAILABLE'});
});

test('signed uploads reject malformed scans without files/status mutation and attach concurrently in one transaction',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const doc=(await (await env.request('/clients/client/drafts','admin',input('supplier-ip','ip'))).json()).document;await env.request(`/${doc.id}/generate`,'admin',{});
  const original=env.repo.getDocument(doc.id),fileCount=readdirSync(env.root).length;
  for(const [name,bytes] of [['scan.pdf',Buffer.from('%PDF-1.4')],['scan.png',Buffer.from('89504e470d0a1a0a','hex')],['scan.jpg',Buffer.from('ffd8ff','hex')],['scan.pdf',streamPdf(Buffer.from('not-zlib'))]]){
   const form=new FormData();form.append('file',new Blob([bytes]),name);const response=await env.request(`/${doc.id}/signed-files`,'admin',form);assert.equal(response.status,422);assert.equal((await response.json()).code,'DOCUMENT_FILE_UNREADABLE');assert.deepEqual(env.repo.getDocument(doc.id),original);assert.equal(readdirSync(env.root).length,fileCount);
  }
  const png=await sharp({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();
  const form=()=>{const data=new FormData();data.append('file',new Blob([png]),'signed.png');return data;};
  const responses=await Promise.all([env.request(`/${doc.id}/signed-files`,'admin',form()),env.request(`/${doc.id}/signed-files`,'admin',form())]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  assert.equal(env.repo.getDocument(doc.id).status,'signed');assert.equal(env.repo.getDocument(doc.id).files.filter(file=>file.purpose==='signed').length,1);
 }finally{await env.close();}
});

test('unregistered historical parties need no accounts; archive-only admin options and backup retain their scan',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const users=env.db.prepare('SELECT count(*) n FROM users').get().n,seq=env.repo.getSequence();
  const response=await env.request('/admin/archive-import','admin',await archiveForm({clientId:undefined}));assert.equal(response.status,201,await response.clone().text());const doc=(await response.json()).document;assert.equal(doc.clientId,null);
  assert.equal(env.db.prepare('SELECT count(*) n FROM users').get().n,users);assert.deepEqual(env.repo.getSequence(),seq);
  assert.equal((await (await env.request('/admin/archive-options')).json()).capabilities.archiveImport,true);
  for(const actor of ['manager','client','other']){assert.equal((await env.request('/admin/archive-options',actor)).status,403);assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`,actor)).status,403);assert(!(await (await env.request('/archive',actor)).json()).documents.some(item=>item.id===doc.id));}
  assert((await (await env.request('/archive')).json()).documents.some(item=>item.id===doc.id));
  const backupPath=path.join(env.root,'archive-backup.zip');await createDocumentsBackup({db:env.db,storageRoot:env.root,outputPath:backupPath,tempRoot:env.root});
  const zip=new AdmZip(readFileSync(backupPath)),file=env.repo.getFileInternal(doc.files[0].id);assert(zip.getEntry(`private/${file.storage_key}`));
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,409);
  await env.request(`/${doc.id}/restore`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,200);
 }finally{await env.close();}
});

test('readiness checks every required table and column without modifying the installed schema',()=>{
 for(const [table,columns] of Object.entries(DOCUMENTS_SCHEMA_COLUMNS)){
  for(const column of columns){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT)');applyDocumentsSchema(db);db.exec('PRAGMA foreign_keys=OFF');
   // Rebuild just one malformed table in this disposable database; no installed schema is touched.
   db.exec(`DROP TABLE ${table}`);db.exec(`CREATE TABLE ${table}(${columns.filter(item=>item!==column).map(item=>`${item} TEXT`).join(',')})`);
   assert.throws(()=>assertDocumentsSchemaReady(db),{code:'DOCUMENTS_SCHEMA_REQUIRED'},`${table}.${column}`);db.close();}
 }
});

test('admin historical signed import is atomic, scoped, idempotent, downloadable and outside current numbering',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const sequence=env.repo.getSequence();
  for(const actor of ['client','manager','other'])assert.equal((await env.request('/admin/archive-import',actor,await archiveForm())).status,403);
  assert.equal((await env.request('/admin/archive-import','admin',await archiveForm({signed:'false'}))).status,400);
  const before=env.db.prepare('SELECT count(*) n FROM documents').get().n;
  const bad=await env.request('/admin/archive-import','admin',await archiveForm({file:Buffer.from('%PDF-1.4')}));assert.equal(bad.status,422);assert.equal((await bad.json()).code,'DOCUMENT_FILE_UNREADABLE');
  assert.equal(env.db.prepare('SELECT count(*) n FROM documents').get().n,before);
  const bytes=await pdf();const form=()=>archiveForm({file:bytes});
  const response=await env.request('/admin/archive-import','admin',await form());assert.equal(response.status,201,await response.clone().text());
  const doc=(await response.json()).document;assert.equal(doc.kind,'imported_contract');assert.equal(doc.status,'signed');assert.equal(doc.number,'История 255 / ABC');assert.equal(doc.files.length,1);
  const storedBeforeRetry=readdirSync(env.root).length;
  const retry=await env.request('/admin/archive-import','admin',await form());assert.equal(retry.status,201);assert.equal((await retry.json()).document.id,doc.id);assert.equal(readdirSync(env.root).length,storedBeforeRetry);
  assert.deepEqual(env.repo.getSequence(),sequence);assert.equal(env.db.prepare('SELECT id FROM documents WHERE id=?').get(doc.id),undefined);
  for(const action of ['generate','review']){const res=await env.request(`/${doc.id}/${action}`,'admin',action==='generate'?{}:undefined);assert.equal(res.status,409);assert.equal((await res.json()).code,'IMPORTED_DOCUMENT_READ_ONLY');}
  assert.throws(()=>env.repo.reserveNumber(doc.id),{code:'IMPORTED_DOCUMENT_READ_ONLY'});
  const download=await env.request(`/${doc.id}/files/${doc.files[0].id}`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`,'other')).status,403);
  assert.equal((await env.request('/archive')).status,200);
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,409);
  await env.request(`/${doc.id}/restore`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/files/${doc.files[0].id}`)).status,200);
 }finally{await env.close();}
});

function counterparty(type) {
  const base = type === "ip" ? "1234567890" : "123456789";
  let inn;
  for (let n = 0; n < (type === "ip" ? 100 : 10); n++) {
    const candidate = base + String(n).padStart(type === "ip" ? 2 : 1, "0");
    if (validInn(candidate)) { inn = candidate; break; }
  }
  const registration = type === "ip" ? "31234567890123" : "112345678901";
  const check = String(BigInt(registration) % BigInt(type === "ip" ? 13 : 11) % 10n);
  return { type, fullName: type === "ip" ? "ИП Проверочный Покупатель" : "ООО «Проверка»", inn, kpp: type === "ooo" ? "123456789" : "",
    ogrnip: type === "ip" ? registration + check : "", ogrn: type === "ooo" ? registration + check : "", legalAddress: "Тестовый адрес",
    bankName: "Тестовый банк", bik: "123456789", settlementAccount: "1".repeat(20), correspondentAccount: "2".repeat(20),
    signerFullName: "Проверочный Покупатель", signerPosition: "Подписант", authorityBasis: "Тестовое основание" };
}
function template() {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{BUYER_FULL_NAME}} {{DOCUMENT_NUMBER}} {{DOCUMENT_DATE}} {{DOCUMENT_DATE_RU}} {{PAYMENT_DAYS}} {{PAYMENT_DAYS_WORDS}} {{PAYMENT_DAYS_UNIT}} {{PAYMENT_START_EVENT}}</w:t></w:r></w:p><w:p><w:r><w:t>{{SUPPLIER_FULL_NAME}} {{SUPPLIER_INN}} {{BUYER_INN}}</w:t></w:r></w:p></w:body></w:document>'));
  return zip.toBuffer();
}
const actors = { admin: { id: "admin", role: "admin" }, client: { id: "client", role: "client" }, other: { id: "other", role: "client" }, manager: { id: "manager", role: "manager" } };
const auth = (req, res, next) => { req.user = actors[req.headers["x-test-actor"]]; if (!req.user) return res.status(401).end(); next(); };

async function environment(converterAvailable = true, { seedTemplates = true, conversionFailures = 0, documentConfig = {}, clientLinks = {}, approvedTemplateBasis=false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT");
  for (const actor of Object.values(actors)) db.prepare("INSERT INTO users VALUES(?,?)").run(actor.id, actor.role);
  applyDocumentsSchema(db);
  const repo = createDocumentsRepository(db);
  const root = mkdtempSync(path.resolve(".tmp/documents-api-"));
  const store = createDocumentStorage(root);
  for (const entityId of ["supplier-ip", "supplier-ooo"]) {
    repo.createLegalEntity({ id: entityId, name: "Проверочный поставщик" });
    repo.createLegalEntityRevision({ entityId, data: counterparty(entityId === "supplier-ip" ? "ip" : "ooo"), actorId: "admin" });
    if (!seedTemplates) continue;
    for (const paymentType of ["prepayment", "postpayment"]) {
      const file = store.put(template(), "docx");
      repo.createTemplateVersion({ templateId: "fixture", entityId, paymentType, storageKey: file.key, sha256: file.sha256, config: approvedTemplateBasis?{blocks:{BUYER_AUTHORITY_BASIS:"Тестовое основание"}}:{}, actorId: "admin" });
    }
  }
  repo.configureSequence({ nextNumber: 255 });
  let conversions = 0;
  const converter = { available: converterAvailable, async convert(docx) { conversions++; assert.ok(new AdmZip(docx).readAsText("word/document.xml").includes("Провер")); if (conversions <= conversionFailures) throw Object.assign(new Error("Тестовая ошибка конвертации."),{code:"TEST_CONVERSION_FAILED"}); return Buffer.from("%PDF-TEST-ONLY"); } };
  const service = createDocumentService({ repository: repo, storage: store, converter });
  const audit = [];
  const app = express(); app.use(express.json({ limit: "256kb" }));
  app.use("/api/documents", createDocumentsRouter({ enabled: true, repository: repo, storage: store, service, authRequired: auth,
    findUser: (id) => actors[id], clientLink: (id) => clientLinks[id] || ({ personalManagerId: "manager" }), config: documentConfig, audit: (_req, event, details) => audit.push({ event, details }) }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/documents`;
  const request = (url, actor = "admin", body, method = body ? "POST" : "GET") => fetch(base + url, { method, headers: { "x-test-actor": actor, ...(body instanceof FormData ? {} : body ? { "Content-Type": "application/json" } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { repo, store, request, audit, db, root, conversions: () => conversions, async close() { await new Promise((resolve) => server.close(resolve)); db.close(); } };
}
function input(entity, type, payment = { type: "prepayment", days: null }) {
  return { legalEntityId: entity, date: "2026-10-05", payment, counterparty: counterparty(type), confirmed: true, idempotencyKey: `${entity}-${type}-${payment.type}-${payment.days}` };
}

async function attachmentForm(bytes,{title='Дополнительное соглашение',category='addendum',idempotencyKey='attachment-1',name='скан.pdf'}={}){const form=new FormData();for(const [key,value] of Object.entries({title,category,idempotencyKey}))form.append(key,value);form.append('file',new Blob([bytes]),name);return form;}
test('contract packages keep signed originals, scoped downloads, idempotent uploads and numbering',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const bytes=await pdf();const doc=(await (await env.request('/admin/archive-import','admin',await archiveForm({file:bytes,clientId:undefined}))).json()).document;
  const seq=env.repo.getSequence(),original=doc.files[0].id;
  for(const actor of ['manager','client','other'])assert.equal((await env.request(`/${doc.id}/attachments`,actor,await attachmentForm(bytes))).status,403);
  const invalid=await env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(Buffer.from('%PDF-1.4')));assert.equal(invalid.status,422);assert.equal(env.db.prepare('SELECT count(*) n FROM document_attachments').get().n,0);
  const responses=await Promise.all([env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(bytes)),env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(bytes))]);for(const res of responses)assert.equal(res.status,201,await res.clone().text());
  const current=(await responses[0].json()).document,attachment=current.files.find(file=>file.type==='attachment');assert(attachment);assert.equal(current.files.length,2);assert.equal(current.files[0].id,original);assert.equal(current.status,'signed');assert.equal(attachment.title,'Дополнительное соглашение');assert.equal(attachment.category,'addendum');assert.deepEqual(env.repo.getSequence(),seq);
  assert.equal(env.db.prepare('SELECT count(*) n FROM document_attachments').get().n,1);
  const conflict=await env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(bytes,{title:'Другой'}));assert.equal(conflict.status,409);
  const download=await env.request(`/${doc.id}/files/${attachment.id}`);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/filename\*=UTF-8/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
  const other=(await (await env.request('/admin/archive-import','admin',await archiveForm({file:bytes,idempotencyKey:'other-parent'}))).json()).document;assert.equal((await env.request(`/${other.id}/files/${attachment.id}`)).status,404);
  const out=path.join(env.root,'package-backup.zip');await createDocumentsBackup({db:env.db,storageRoot:env.root,outputPath:out,tempRoot:env.root});assert(new AdmZip(readFileSync(out)).getEntry(`private/${env.repo.getFileInternal(attachment.id).storage_key}`));
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(bytes,{idempotencyKey:'new-key'}))).status,409);assert.equal((await env.request(`/${doc.id}/files/${attachment.id}`)).status,409);
  await env.request(`/${doc.id}/restore`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/files/${attachment.id}`)).status,200);
 }finally{await env.close();}
});
test('purge requires admin confirmed trash and erases package bytes and PII while retaining number ledger',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const request=input('supplier-ip','ip');request.counterparty.fullName='Sensitive client';const doc=(await (await env.request('/admin/generator/drafts','admin',request)).json()).document;
  await env.request(`/${doc.id}/generate`,'admin',{});
  const bytes=await pdf(),form=new FormData();form.append('file',new Blob([bytes]),'signed.pdf');assert.equal((await env.request(`/${doc.id}/signed-files`,'admin',form)).status,200);
  assert.equal((await env.request(`/${doc.id}/attachments`,'admin',await attachmentForm(bytes))).status,201);
  const before=env.repo.getDocument(doc.id),keys=before.files.map(file=>env.repo.getFileInternal(file.id).storage_key),seq=env.repo.getSequence();
  for(const actor of ['manager','client','other'])assert.equal((await env.request(`/${doc.id}/purge`,actor,{confirmed:true})).status,403);
  assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:true})).status,409);
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:false})).status,400);
  const results=await Promise.all([env.request(`/${doc.id}/purge`,'admin',{confirmed:true}),env.request(`/${doc.id}/purge`,'admin',{confirmed:true})]);for(const result of results)assert.equal(result.status,200,await result.clone().text());
  for(const key of keys)assert.throws(()=>env.store.read(key),{code:'ENOENT'});
  for(const table of ['documents','document_revisions','document_files','document_attachments','counterparty_snapshots'])assert.equal(env.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0,table);
  assert.equal(env.db.prepare('SELECT count(*) n FROM document_purge_permissions').get().n,0);
  const tomb=env.db.prepare('SELECT * FROM document_tombstones WHERE id=?').get(doc.id);assert.equal(tomb.number,before.number);assert(!JSON.stringify(tomb).includes('Sensitive'));assert.deepEqual(env.repo.getSequence(),seq);
  assert.throws(()=>env.repo.configureSequence({nextNumber:255}),/SEQUENCE_ALREADY_USED/);
  assert.equal((await env.request('/admin/generator/drafts','admin',request)).status,410);
  assert.equal((await env.request(`/${doc.id}/restore`,'admin',{confirmed:true})).status,410);assert.equal((await env.request(`/${doc.id}/files/${before.files[0].id}`)).status,410);
  const next={...request,idempotencyKey:'next-contract'};const nextDoc=(await (await env.request('/admin/generator/drafts','admin',next)).json()).document;env.repo.reserveNumber(nextDoc.id);assert.equal(env.repo.getDocument(nextDoc.id).ordinal,256);assert.equal(env.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{await env.close();}
});
test('historical purge retains import retry ledger and shared original bytes',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const bytes=await pdf(),fields={file:bytes,clientId:undefined};const doc=(await (await env.request('/admin/archive-import','admin',await archiveForm(fields))).json()).document;
  const file=env.repo.getFileInternal(doc.files[0].id),seq=env.repo.getSequence();
  // A supplier template shares this private key: purge must preserve its bytes.
  env.repo.createTemplateVersion({templateId:'shared',entityId:'supplier-ip',paymentType:'prepayment',storageKey:file.storage_key,sha256:file.sha256,config:{},actorId:'admin'});
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:true})).status,200);assert.deepEqual(env.store.read(file.storage_key),bytes);
  assert.equal((await env.request('/admin/archive-import','admin',await archiveForm(fields))).status,410);assert.deepEqual(env.repo.getSequence(),seq);assert.equal(env.db.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{await env.close();}
});
test('failed byte cleanup remains retryable in trash without client PII',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  const bytes=await pdf(),doc=(await (await env.request('/admin/archive-import','admin',await archiveForm({file:bytes,clientId:undefined}))).json()).document;
  const file=env.repo.getFileInternal(doc.files[0].id),remove=env.store.remove;let failed=true;
  env.store.remove=key=>{if(failed)throw Object.assign(new Error('Cleanup unavailable'),{code:'DOCUMENT_PURGE_INCOMPLETE',status:503});remove(key);};
  await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:true})).status,503);
  const pending=(await (await env.request('/trash')).json()).documents.find(item=>item.id===doc.id);assert(pending);assert.equal(pending.status,'purging');assert.equal(pending.canRestore,false);assert.equal(pending.canPurge,true);assert.deepEqual(pending.counterparty,{fullName:'',inn:''});assert.deepEqual(env.store.read(file.storage_key),bytes);
  failed=false;assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:true})).status,200);assert.equal((await (await env.request('/trash')).json()).documents.length,0);assert.throws(()=>env.store.read(file.storage_key),{code:'ENOENT'});
 }finally{await env.close();}
});
test('purge removes dedicated source card but preserves a source shared with another contract',async()=>{
 const env=await environment(true,{documentConfig:{fileValidatorPython:python}});try{
  for(const shared of [false,true]){
    const blob=env.store.put(await pdf(),'pdf'),card=env.repo.createImport({clientId:null,actorId:'admin',storageKey:blob.key,sha256:blob.sha256});env.repo.updateImport({id:card.id,state:'running'});env.repo.updateImport({id:card.id,state:'succeeded',result:{fields:{fullName:'Sensitive source'}}});
    const req={...input('supplier-ip','ip'),idempotencyKey:`source-${shared}`,importId:card.id};const doc=(await (await env.request('/admin/generator/drafts','admin',req)).json()).document;assert(doc);
    let other;if(shared){other=(await (await env.request('/admin/generator/drafts','admin',{...req,idempotencyKey:'shared-source'})).json()).document;assert(other);}
    await env.request(`/${doc.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${doc.id}/purge`,'admin',{confirmed:true})).status,200);
    if(shared){assert(env.repo.getImport(card.id));assert.equal(env.store.read(blob.key).subarray(0,5).toString(),'%PDF-');await env.request(`/${other.id}/trash`,'admin',{confirmed:true});assert.equal((await env.request(`/${other.id}/purge`,'admin',{confirmed:true})).status,200);}
    assert.equal(env.repo.getImport(card.id),null);assert.throws(()=>env.store.read(blob.key),{code:'ENOENT'});
  }
 }finally{await env.close();}
});
test('additive package migration preserves existing contracts and restores bounded delete guards',async()=>{
 const {applyDocumentsPackageSchema}=await import('../src/documents/schema.js');const env=await environment();try{
  const doc=env.repo.createDraft({clientId:null,entityId:'supplier-ip',payment:{type:'prepayment'},counterparty:counterparty('ip'),date:'2026-10-07',actorId:'admin',idempotencyKey:'migration-existing'});const before=env.repo.getDocument(doc.id);
  for(const table of ['document_attachments','document_tombstones','document_purge_permissions'])env.db.exec(`DROP TABLE ${table}`);
  assert.throws(()=>assertDocumentsSchemaReady(env.db),{code:'DOCUMENTS_SCHEMA_REQUIRED'});applyDocumentsPackageSchema(env.db);applyDocumentsPackageSchema(env.db);assert.deepEqual(env.repo.getDocument(doc.id),before);assert.equal(env.db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.throws(()=>env.db.prepare('DELETE FROM documents WHERE id=?').run(doc.id),/DOCUMENT_DELETE_FORBIDDEN/);assert.equal(env.db.prepare('SELECT count(*) n FROM document_purge_permissions').get().n,0);
 }finally{await env.close();}
});
