import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DOCUMENTS_SCHEMA_SQL, applyStandaloneDocumentsSchema, assertDocumentsSchemaReady } from '../src/documents/schema.js';
import { createDocumentsRepository } from '../src/documents/repository.js';

test('explicit standalone migration preserves populated relational records and restores protection',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT) STRICT;INSERT INTO users VALUES('admin','admin'),('client','client');");
  const legacy=DOCUMENTS_SCHEMA_SQL.replace(/(CREATE TABLE IF NOT EXISTS (?:documents|counterparty_snapshots|document_imports) \(\s*id TEXT PRIMARY KEY, client_id TEXT) REFERENCES/g,'$1 NOT NULL REFERENCES');
  db.exec(legacy);db.exec('CREATE INDEX custom_docs_actor ON documents(actor_id);');
  assert.throws(()=>assertDocumentsSchemaReady(db),{code:'DOCUMENTS_SCHEMA_REQUIRED'});
  const repo=createDocumentsRepository(db);repo.createLegalEntity({id:'supplier',name:'Test'});
  const entity=repo.createLegalEntityRevision({entityId:'supplier',data:{name:'Supplier'},actorId:'admin'});
  const snapshot=repo.saveCounterparty({clientId:'client',data:{name:'Buyer'},actorId:'admin'});
  const template=repo.createTemplateVersion({templateId:'test',entityId:'supplier',paymentType:'prepayment',storageKey:'test.docx',sha256:'a'.repeat(64),config:{},actorId:'admin'});
  const doc=repo.createDraft({clientId:'client',entityId:'supplier',payment:{type:'prepayment'},actorId:'admin',idempotencyKey:'old',counterparty:{name:'Buyer'},date:'2026-10-07'});
  repo.configureSequence({nextNumber:255,prefix:'1-636/'});repo.reserveNumber(doc.id);
  const revision=repo.createRevision({documentId:doc.id,entityRevisionId:entity,counterpartySnapshotId:snapshot,templateVersionId:template,actorId:'admin',date:'2026-10-07'});
  repo.addFile({documentId:doc.id,revisionId:revision.id,purpose:'docx',storageKey:'output.docx',originalName:'test',mime:'application/octet-stream',size:10,sha256:'b'.repeat(64),actorId:'admin'});
  repo.createJob({documentId:doc.id,kind:'generation',idempotencyKey:'old-job'});
  repo.createImport({clientId:'client',actorId:'admin',storageKey:'card.docx',sha256:'c'.repeat(64)});
  const before=repo.getDocument(doc.id);
  applyStandaloneDocumentsSchema(db);applyStandaloneDocumentsSchema(db);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE name='custom_docs_actor'").get());
  assertDocumentsSchemaReady(db);assert.deepEqual(repo.getDocument(doc.id),before);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>db.prepare('UPDATE counterparty_snapshots SET data_json=? WHERE id=?').run('{}',snapshot),/IMMUTABLE/);
  assert.throws(()=>db.prepare('DELETE FROM documents WHERE id=?').run(doc.id),/DOCUMENT_DELETE/);
  const standalone=repo.createDraft({clientId:null,entityId:'supplier',payment:{type:'prepayment'},actorId:'admin',idempotencyKey:'new',counterparty:{name:'Other'},date:'2026-10-07'});
  assert.equal(standalone.clientId,null);
  assert.equal(repo.saveCounterparty({clientId:null,data:{name:'Other'},actorId:'admin'}).length,36);
  assert.equal(db.prepare('SELECT count(*) n FROM counterparty_details').get().n,1);
 } finally{db.close();}
});
