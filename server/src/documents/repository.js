import { randomUUID } from 'node:crypto';
import { formatContractNumber, POSTPAYMENT_START_EVENT } from './businessRules.js';
import { documentError } from './storage.js';

const now = () => new Date().toISOString();
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
 ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v);
const required = value => { if (typeof value !== 'string' || !value.trim()) throw new Error('REQUIRED_VALUE'); return value; };
const dateCheck = date => {
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE');
 const parsed=new Date(`${date}T00:00:00Z`);
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date) throw new Error('INVALID_DATE');
 return date;
};
const paymentCheck = payment => {
 if (payment?.type === 'prepayment' && (payment.days === undefined || payment.days === null)) return {type:'prepayment'};
 if (payment?.type === 'postpayment' && Number.isSafeInteger(payment.days) && payment.days > 0) return {type:'postpayment',days:payment.days};
 throw new Error('INVALID_PAYMENT');
};

// Authorization belongs to the caller. Only pass an explicitly configured database.
export function createDocumentsRepository(db) {
 if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) throw new Error('FOREIGN_KEYS_REQUIRED');
 const get = (sql,...params) => db.prepare(sql).get(...params);
 const run = (sql,...params) => db.prepare(sql).run(...params);
 const templateVersion = id => { const row=get('SELECT * FROM document_template_versions WHERE id=?',id);return row?{...row,entityId:row.entity_id,paymentType:row.payment_type,storageKey:row.storage_key,config:JSON.parse(row.config_json),approved:true}:null; };
 const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const result=fn(); db.exec('COMMIT'); return result; } catch(error) {db.exec('ROLLBACK');throw error;} };
 const available = id => {if(get('SELECT document_id FROM document_trash WHERE document_id=?',id)||get('SELECT id FROM document_archive_entries WHERE id=? AND deleted_at IS NOT NULL',id)) throw documentError('DOCUMENT_TRASHED','Договор находится в корзине. Сначала восстановите его.',409);};
 const attachments = id => db.prepare('SELECT * FROM document_attachments WHERE document_id=? OR archive_id=? ORDER BY created_at,id').all(id,id).map(file=>({...file,type:'attachment',name:file.original_name,createdAt:file.created_at}));
 const importedDocument = row => ({...row,kind:'imported_contract',number:row.historical_number,status:'signed',clientId:row.client_id,entityId:row.entity_id,createdAt:row.created_at,payment:{},draftData:JSON.parse(row.metadata_json),files:db.prepare('SELECT id,purpose,original_name,mime,size,sha256 FROM document_archive_files WHERE document_id=? ORDER BY created_at,id').all(row.id).map(file=>({...file,type:file.purpose,name:file.original_name})).concat(attachments(row.id))});
 const document = (id,{includeTrashed=false}={}) => {if(get('SELECT id FROM document_tombstones WHERE id=?',id))throw documentError('DOCUMENT_PURGED','Договор удалён окончательно.',410);const archived=get('SELECT * FROM document_archive_entries WHERE id=?',id);if(archived){if(!includeTrashed)available(id);return importedDocument(archived);} const row=get('SELECT * FROM documents WHERE id=?',id); if(!row) throw new Error('DOCUMENT_NOT_FOUND'); if(!includeTrashed)available(id); return {...row,clientId:row.client_id,entityId:row.entity_id,createdAt:row.created_at,payment:JSON.parse(row.payment_json),draftData:JSON.parse(row.request_json),files:db.prepare('SELECT id,purpose,original_name,mime,size,sha256,revision_id FROM document_files WHERE document_id=? ORDER BY created_at,id').all(id).map(file=>({...file,type:file.purpose,name:file.original_name,revisionId:file.revision_id})).concat(attachments(id))}; };
 return {
  createLegalEntity({id,name,active=true}) { run('INSERT INTO legal_entities(id,name,active) VALUES(?,?,?)',required(id),required(name),active?1:0); return id; },
  updateLegalEntity({id,name}) { run('UPDATE legal_entities SET name=? WHERE id=?',required(name),required(id)); },
  setLegalEntityActive(id,active) { run('UPDATE legal_entities SET active=? WHERE id=?',active?1:0,required(id)); },
  listTemplateVersions(entityId) { return db.prepare('SELECT id FROM document_template_versions WHERE entity_id=? ORDER BY created_at DESC,rowid DESC').all(entityId).map(row=>templateVersion(row.id)); },
  createLegalEntityRevision({entityId,data,actorId}) { const id=randomUUID(); run('INSERT INTO legal_entity_revisions VALUES(?,?,?,?,?)',id,entityId,canonical(data),actorId,now()); return id; },
  saveApprovedLegalEntity({id,name,data,actorId}) {return tx(()=>{
    if(get('SELECT id FROM legal_entities WHERE id=?',required(id))) run('UPDATE legal_entities SET name=?,active=0 WHERE id=?',required(name),id);
    else run('INSERT INTO legal_entities(id,name,active) VALUES(?,?,0)',id,required(name));
    const revisionId=randomUUID();run('INSERT INTO legal_entity_revisions VALUES(?,?,?,?,?)',revisionId,id,canonical(data),actorId,now());
    return revisionId;
  });},
  createTemplateVersion({templateId,entityId,paymentType,storageKey,sha256,config,actorId}) { const id=randomUUID(); run('INSERT INTO document_template_versions VALUES(?,?,?,?,?,?,?,?,?)',id,templateId,entityId,paymentType,storageKey,sha256,canonical(config),actorId,now()); return id; },
  publishApprovedTemplate({templateId,entityId,paymentType,storageKey,sha256,config,actorId}) {return tx(()=>{
    const id=randomUUID();run('INSERT INTO document_template_versions VALUES(?,?,?,?,?,?,?,?,?)',id,templateId,entityId,paymentType,storageKey,sha256,canonical(config),actorId,now());
    run('UPDATE legal_entities SET active=0 WHERE id=?',entityId);
    return id;
  });},
  saveCounterparty({clientId,data,actorId}) { return tx(()=> { const id=randomUUID(); run('INSERT INTO counterparty_snapshots VALUES(?,?,?,?,?)',id,clientId,canonical(data),actorId,now()); if(clientId!==null) run('INSERT INTO counterparty_details VALUES(?,?) ON CONFLICT(client_id) DO UPDATE SET snapshot_id=excluded.snapshot_id',clientId,id); return id; }); },
  findDraftRetry({clientId,entityId,payment,actorId,idempotencyKey,counterparty,date,importId,verificationChoices={}}) {
    required(idempotencyKey);
    const previous=get('SELECT * FROM documents WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey);
    if(get('SELECT id FROM document_tombstones WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('DOCUMENT_PURGED','Этот запрос относится к окончательно удалённому договору.',410);
    if(!previous)return null;
    const stored=JSON.parse(previous.request_json);delete stored.verification;delete stored.generationVerification;
    const request={clientId,entityId,payment:paymentCheck(payment),counterparty,date,...(importId?{importId}:{}),...(Object.keys(verificationChoices).length?{verificationChoices}:{})};
    if(canonical(stored)!==canonical(request))throw documentError('IDEMPOTENCY_CONFLICT','IDEMPOTENCY_CONFLICT: повторный запрос содержит другие данные.',422);
    return document(previous.id);
  },
  saveDraftGenerationVerification(id,verification) {return tx(()=>{
    const doc=document(id);if(doc.kind==='imported_contract'||doc.status!=='draft')throw documentError('DOCUMENT_NOT_DRAFT','Проверка доступна только для черновика.',409);
    const job=get("SELECT state FROM document_jobs WHERE document_id=? AND kind='generation' AND idempotency_key='generation-v1'",id);
    if(job?.state==='succeeded')return;
    run('UPDATE documents SET request_json=? WHERE id=?',canonical({...doc.draftData,generationVerification:verification}),id);
  });},
  createDraft({clientId,entityId,payment,actorId,idempotencyKey,counterparty,date,importId,verificationChoices={},serverVerification}) {
   required(idempotencyKey); dateCheck(date);
   if(!counterparty||typeof counterparty!=='object'||Array.isArray(counterparty)) throw new Error('COUNTERPARTY_REQUIRED');
   const normalized=paymentCheck(payment), request=canonical({clientId,entityId,payment:normalized,counterparty,date,...(importId?{importId}:{}),...(Object.keys(verificationChoices).length?{verificationChoices}:{}),...(serverVerification?{verification:serverVerification}:{})});
   return tx(()=> { const previous=get('SELECT * FROM documents WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey);
    if(get('SELECT id FROM document_tombstones WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('DOCUMENT_PURGED','Этот запрос относится к окончательно удалённому договору.',410);
    if(get('SELECT id FROM document_attachments WHERE created_by=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    if(get('SELECT id FROM document_archive_entries WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    if(previous) return this.findDraftRetry({clientId,entityId,payment,actorId,idempotencyKey,counterparty,date,importId,verificationChoices});
    if(!get('SELECT id FROM legal_entities WHERE id=? AND active=1',entityId)) throw new Error('ENTITY_NOT_ACTIVE');
    if(clientId!==null&&get('SELECT role FROM users WHERE id=?',clientId)?.role!=='client') throw new Error('CLIENT_REQUIRED');
    const id=randomUUID(); run('INSERT INTO documents(id,client_id,entity_id,actor_id,payment_json,idempotency_key,request_json,created_at) VALUES(?,?,?,?,?,?,?,?)',id,clientId,entityId,actorId,canonical(normalized),idempotencyKey,request,now()); return document(id);
   });
  },
  getDocument:document,
  findArchivedImport({clientId=null,entityId,number,counterparty,actorId,idempotencyKey,sha256}) {
    if(get('SELECT id FROM document_tombstones WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('DOCUMENT_PURGED','Этот запрос относится к окончательно удалённому договору.',410);
    if(get('SELECT id FROM document_attachments WHERE created_by=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    const previous=get('SELECT * FROM document_archive_entries WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey);
    if(previous){if(previous.metadata_json!==canonical({counterparty,historicalNumber:number,signed:true,sha256})||previous.client_id!==clientId||previous.entity_id!==entityId)throw documentError('IDEMPOTENCY_CONFLICT','Повторный запрос содержит другие данные.',409);return document(previous.id);}
    if(get('SELECT id FROM documents WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    return null;
  },
  importArchivedDocument({clientId=null,entityId,number,counterparty,actorId,idempotencyKey,file}) {return tx(()=>{
    if(get('SELECT role FROM users WHERE id=?',actorId)?.role!=='admin')throw documentError('ADMIN_REQUIRED','Требуется администратор.',403);
    required(idempotencyKey);required(number);
    if(!get('SELECT id FROM legal_entities WHERE id=?',entityId))throw documentError('ENTITY_NOT_FOUND','Юрлицо не найдено.',404);
    if(clientId!==null&&get('SELECT role FROM users WHERE id=?',clientId)?.role!=='client')throw documentError('CLIENT_NOT_FOUND','Клиент не найден.',404);
    const metadata={counterparty,historicalNumber:number,signed:true,sha256:file.sha256};const request=canonical(metadata);
    if(get('SELECT id FROM document_tombstones WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('DOCUMENT_PURGED','Этот запрос относится к окончательно удалённому договору.',410);
    if(get('SELECT id FROM document_attachments WHERE created_by=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    const previous=get('SELECT * FROM document_archive_entries WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey);
    if(previous){if(previous.metadata_json!==request||previous.client_id!==clientId||previous.entity_id!==entityId)throw documentError('IDEMPOTENCY_CONFLICT','Повторный запрос содержит другие данные.',409);return document(previous.id);}
    if(get('SELECT id FROM documents WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    const id=randomUUID();run('INSERT INTO document_archive_entries(id,client_id,entity_id,actor_id,historical_number,metadata_json,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)',id,clientId,entityId,actorId,number,request,idempotencyKey,now());
    run('INSERT INTO document_archive_files VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),id,'signed',required(file.storageKey),required(file.originalName),required(file.mime),file.size,file.sha256,actorId,now());
    return document(id);
  });},
  listStandaloneDocuments(){return db.prepare('SELECT id FROM documents WHERE client_id IS NULL AND NOT EXISTS(SELECT 1 FROM document_trash t WHERE t.document_id=documents.id) ORDER BY created_at,id').all().map(row=>document(row.id)).concat(this.listUnassignedArchivedDocuments());},
  listUnassignedArchivedDocuments(){return db.prepare('SELECT * FROM document_archive_entries WHERE client_id IS NULL AND deleted_at IS NULL ORDER BY created_at,id').all().map(importedDocument);},
  listTrashedDocuments() {return db.prepare('SELECT t.* FROM document_trash t ORDER BY deleted_at DESC,document_id').all().map(row=>({...document(row.document_id,{includeTrashed:true}),deletedAt:row.deleted_at,deletedBy:row.deleted_by})).concat(db.prepare('SELECT * FROM document_archive_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all().map(row=>({...importedDocument(row),deletedAt:row.deleted_at,deletedBy:row.deleted_by})));},
  trashDocument({documentId,actorId}) {return tx(()=>{
    if(get('SELECT role FROM users WHERE id=?',actorId)?.role!=='admin')throw documentError('ADMIN_REQUIRED','Требуется администратор.',403);
    const doc=document(documentId,{includeTrashed:true});
    if(doc.kind==='imported_contract'){const row=get('SELECT deleted_at FROM document_archive_entries WHERE id=?',documentId);const deletedAt=row.deleted_at || now();if(!row.deleted_at)run('UPDATE document_archive_entries SET deleted_at=?,deleted_by=? WHERE id=?',deletedAt,actorId,documentId);return {id:documentId,trashed:true,deletedAt};}
    const previous=get('SELECT * FROM document_trash WHERE document_id=?',documentId);
    if(previous)return {id:documentId,trashed:true,deletedAt:previous.deleted_at};
    if(get("SELECT id FROM document_jobs WHERE document_id=? AND kind='generation' AND state IN ('queued','running')",documentId))throw documentError('DOCUMENT_GENERATION_ACTIVE','Дождитесь завершения создания договора.',409);
    const deletedAt=now();run('INSERT INTO document_trash VALUES(?,?,?)',doc.id,deletedAt,actorId);
    return {id:doc.id,trashed:true,deletedAt};
  });},
  preparePurge({documentId,actorId}) {return tx(()=>{
    if(get('SELECT role FROM users WHERE id=?',actorId)?.role!=='admin')throw documentError('ADMIN_REQUIRED','Требуется администратор.',403);
    const previous=get('SELECT * FROM document_tombstones WHERE id=?',documentId);if(previous)return previous;
    const doc=document(documentId,{includeTrashed:true}),imported=doc.kind==='imported_contract';
    if(imported?!doc.deleted_at:!get('SELECT document_id FROM document_trash WHERE document_id=?',documentId))throw documentError('DOCUMENT_NOT_TRASHED','Сначала переместите договор в корзину.',409);
    if(get("SELECT id FROM document_jobs WHERE document_id=? AND state IN ('queued','running')",documentId))throw documentError('DOCUMENT_GENERATION_ACTIVE','Дождитесь завершения обработки договора.',409);
    const attachmentRows=db.prepare('SELECT * FROM document_attachments WHERE document_id=? OR archive_id=?').all(documentId,documentId);
    for(const item of attachmentRows)run('INSERT INTO document_tombstones VALUES(?,?,?,?,?,?,?,?)',item.id,'attachment',null,null,item.created_by,item.idempotency_key,now(),'[]');
    const keys=[],grant=(table,id)=>run('INSERT INTO document_purge_permissions VALUES(?,?)',table,id);
    const remove=(table,rows)=>{for(const row of rows){grant(table,row.id);if(row.storage_key)keys.push(row.storage_key);run(`DELETE FROM ${table} WHERE id=?`,row.id);}};
    remove('document_attachments',db.prepare('SELECT * FROM document_attachments WHERE document_id=? OR archive_id=?').all(documentId,documentId));
    if(imported){remove('document_archive_files',db.prepare('SELECT * FROM document_archive_files WHERE document_id=?').all(documentId));remove('document_archive_entries',[doc]);}
    else {
      const revisions=db.prepare('SELECT * FROM document_revisions WHERE document_id=?').all(documentId);
      remove('document_files',db.prepare('SELECT * FROM document_files WHERE document_id=?').all(documentId));
      run('DELETE FROM document_jobs WHERE document_id=?',documentId);
      remove('document_revisions',revisions);run('DELETE FROM document_trash WHERE document_id=?',documentId);remove('documents',[doc]);
      for(const id of new Set(revisions.map(row=>row.counterparty_snapshot_id))){
        if(!get('SELECT id FROM document_revisions WHERE counterparty_snapshot_id=?',id)&&!get('SELECT client_id FROM counterparty_details WHERE snapshot_id=?',id))remove('counterparty_snapshots',[get('SELECT * FROM counterparty_snapshots WHERE id=?',id)]);
      }
      const importId=doc.draftData.importId;
      if(importId&&!get("SELECT id FROM documents WHERE json_extract(request_json,'$.importId')=?",importId)){
        const card=get('SELECT * FROM document_imports WHERE id=?',importId);if(card){keys.push(card.storage_key);run('DELETE FROM document_imports WHERE id=?',importId);}
      }
    }
    // Never remove blobs still used by another contract, import or supplier template.
    const pending=keys.filter(key=>!get('SELECT storage_key FROM document_files WHERE storage_key=? UNION SELECT storage_key FROM document_archive_files WHERE storage_key=? UNION SELECT storage_key FROM document_attachments WHERE storage_key=? UNION SELECT storage_key FROM document_template_versions WHERE storage_key=? UNION SELECT storage_key FROM document_imports WHERE storage_key=?',key,key,key,key,key));
    run('INSERT INTO document_tombstones VALUES(?,?,?,?,?,?,?,?)',doc.id,doc.kind,doc.number ?? null,doc.ordinal ?? null,doc.actor_id,doc.idempotency_key,now(),JSON.stringify([...new Set(pending)]));
    run('DELETE FROM document_purge_permissions');
    return get('SELECT * FROM document_tombstones WHERE id=?',documentId);
  });},
  listPendingPurges() {return db.prepare("SELECT id,kind,number,purged_at FROM document_tombstones WHERE pending_keys_json!='[]'").all();},
  completePurge(id) {run("UPDATE document_tombstones SET pending_keys_json='[]' WHERE id=?",id);},
  restoreDocument({documentId,actorId}) {return tx(()=>{
    if(get('SELECT role FROM users WHERE id=?',actorId)?.role!=='admin')throw documentError('ADMIN_REQUIRED','Требуется администратор.',403);
    const doc=document(documentId,{includeTrashed:true});if(doc.kind==='imported_contract'){run('UPDATE document_archive_entries SET deleted_at=NULL,deleted_by=NULL WHERE id=?',documentId);return document(documentId);}run('DELETE FROM document_trash WHERE document_id=?',documentId);
    return document(documentId);
  });},
  listDocumentClientIds() { return db.prepare('SELECT DISTINCT client_id FROM documents WHERE NOT EXISTS(SELECT 1 FROM document_trash t WHERE t.document_id=documents.id) ORDER BY client_id').all().map(row=>row.client_id).concat(db.prepare('SELECT DISTINCT client_id FROM document_archive_entries WHERE client_id IS NOT NULL AND deleted_at IS NULL').all().map(row=>row.client_id)).filter((id,index,all)=>all.indexOf(id)===index); },
  listDocuments(clientId) { return db.prepare('SELECT id FROM documents WHERE client_id=? AND NOT EXISTS(SELECT 1 FROM document_trash t WHERE t.document_id=documents.id) ORDER BY created_at,id').all(clientId).map(row=>document(row.id)).concat(db.prepare('SELECT * FROM document_archive_entries WHERE client_id=? AND deleted_at IS NULL').all(clientId).map(importedDocument)); },
  listLegalEntities({includeInactive=false}={}) { return db.prepare(`SELECT * FROM legal_entities ${includeInactive?'':'WHERE active=1'} ORDER BY id`).all().map(entity=> {const revision=get('SELECT * FROM legal_entity_revisions WHERE entity_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',entity.id);return {...entity,approved:Boolean(revision),revisionId:revision?.id,data:revision?JSON.parse(revision.data_json):null};}); },
  getCounterpartySnapshot(clientId) { const row=get('SELECT s.* FROM counterparty_snapshots s JOIN counterparty_details d ON d.snapshot_id=s.id WHERE d.client_id=?',clientId);return row?{...row,data:JSON.parse(row.data_json)}:null; },
  getTemplateVersion:templateVersion,
  findTemplateVersion(entityId,paymentType,buyerType) {
    const rows=db.prepare('SELECT id,config_json FROM document_template_versions WHERE entity_id=? AND payment_type=? ORDER BY created_at DESC,rowid DESC').all(entityId,paymentType);
    const selected=buyerType===undefined?rows[0]:rows.find(row=> {const config=JSON.parse(row.config_json); return !config.buyerTypes || config.buyerTypes.includes(buyerType);}) || rows[0];
    // Return the latest incompatible version when none match so the service
    // reports a precise buyer-type mismatch rather than generating with it.
    return selected?templateVersion(selected.id):null;
  },
  getRevision(documentId) { const row=get('SELECT * FROM document_revisions WHERE document_id=? ORDER BY revision DESC LIMIT 1',documentId);return row?{...row,snapshot:JSON.parse(row.snapshot_json)}:null; },
  getJob(id) { return get('SELECT * FROM document_jobs WHERE id=?',id)??null; },
  getGenerationJob(documentId) { return get("SELECT * FROM document_jobs WHERE document_id=? AND kind='generation' AND idempotency_key='generation-v1'",documentId)??null; },
  claimGenerationJob(documentId,{nowMs=Date.now(),leaseMs=120000}={}) {
   if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(leaseMs)||leaseMs<1||!Number.isSafeInteger(nowMs+leaseMs)) throw new Error('INVALID_GENERATION_LEASE');
   return tx(()=> {
    const doc=document(documentId);
    let job=get("SELECT * FROM document_jobs WHERE document_id=? AND kind='generation' AND idempotency_key='generation-v1'",documentId);
    if(job?.state==='succeeded'||(job?.state==='running'&&job.lease_expires_at>nowMs)) return {...job,claimed:false};
    if(doc.status!=='draft') throw new Error('DOCUMENT_NOT_DRAFT');
    if(!job) {const id=randomUUID();run("INSERT INTO document_jobs(id,document_id,kind,idempotency_key,created_at) VALUES(?,?,'generation','generation-v1',?)",id,documentId,now());job=get('SELECT * FROM document_jobs WHERE id=?',id);}
    run("UPDATE document_jobs SET state='running',started_at=?,lease_token=?,lease_expires_at=?,error_code=NULL,result_json=NULL WHERE id=?",nowMs,randomUUID(),nowMs+leaseMs,job.id);
    return {...get('SELECT * FROM document_jobs WHERE id=?',job.id),claimed:true};
   });
  },
  finalizeGeneration({jobId,leaseToken,documentId,revisionId,files,nowMs=Date.now()}) {return tx(()=> {
   available(documentId);
   const job=get('SELECT * FROM document_jobs WHERE id=? AND document_id=?',jobId,documentId);
   if(job?.state==='succeeded'&&job.lease_token===leaseToken) return document(documentId);
   if(!job||job.kind!=='generation'||job.state!=='running'||job.lease_token!==leaseToken||!Number.isSafeInteger(nowMs)||!(job.lease_expires_at>nowMs)) throw new Error('GENERATION_LEASE_LOST');
   const doc=document(documentId);if(doc.status!=='draft') throw new Error('DOCUMENT_NOT_DRAFT');
   const latest=get('SELECT id FROM document_revisions WHERE document_id=? ORDER BY revision DESC LIMIT 1',documentId);
   if(!latest||latest.id!==revisionId) throw new Error('GENERATION_REVISION_MISMATCH');
   if(!Array.isArray(files)||files.length!==2||new Set(files.map(file=>file.purpose)).size!==2||files.some(file=>!['docx','pdf'].includes(file.purpose))) throw new Error('BOTH_OUTPUTS_REQUIRED');
   for(const file of files) run('INSERT INTO document_files VALUES(?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),documentId,revisionId,file.purpose,required(file.storageKey),required(file.originalName),required(file.mime),file.size,file.sha256,file.actorId,now());
   run("UPDATE documents SET status='generated' WHERE id=?",documentId);
   run("UPDATE document_jobs SET state='succeeded',result_json=?,error_code=NULL WHERE id=?",canonical({documentId,revisionId}),jobId);
   return document(documentId);
  });},
  failGeneration({jobId,leaseToken,errorCode}) {return tx(()=> {
   const job=get('SELECT document_id FROM document_jobs WHERE id=?',jobId);if(job)available(job.document_id);
   const result=run("UPDATE document_jobs SET state='failed',error_code=? WHERE id=? AND state='running' AND lease_token=?",required(errorCode),jobId,leaseToken);return result.changes===1;
  });},
  getSequence() { return get("SELECT * FROM document_sequences WHERE name='contracts'")??null; },
  createImport({clientId,actorId,storageKey,sha256}) { const id=randomUUID();run('INSERT INTO document_imports(id,client_id,actor_id,storage_key,sha256,created_at) VALUES(?,?,?,?,?,?)',id,clientId,actorId,required(storageKey),sha256,now());return get('SELECT * FROM document_imports WHERE id=?',id); },
  getImport(id) { const row=get('SELECT * FROM document_imports WHERE id=?',id);return row?{...row,clientId:row.client_id,actorId:row.actor_id,storageKey:row.storage_key,result:row.result_json?JSON.parse(row.result_json):null}:null; },
  reserveImportAI({id,sourceKey}) { return tx(()=> {
    const row=get('SELECT * FROM document_imports WHERE id=?',id);
    if(!row || row.state!=='succeeded')throw documentError('AI_IMPORT_NOT_READY','Сначала распознайте карточку локально.',409);
    const result=JSON.parse(row.result_json || '{}');
    const existing=result.aiAttempts?.[sourceKey];
    if(existing)return {existing};
    const requestId=randomUUID();
    result.aiAttempts={...result.aiAttempts,[sourceKey]:{state:'running',requestId}};
    run('UPDATE document_imports SET result_json=? WHERE id=?',canonical(result),id);
    return {requestId};
  }); },
  finishImportAI({id,sourceKey,requestId,result:enhanced}) { return tx(()=> {
    const row=get('SELECT * FROM document_imports WHERE id=?',id);
    const result=row?.result_json?JSON.parse(row.result_json):{};
    const attempt=result.aiAttempts?.[sourceKey];
    if(!row || row.state!=='succeeded' || attempt?.state!=='running' || attempt.requestId!==requestId)throw documentError('AI_ATTEMPT_MISMATCH','Состояние обработки карточки изменилось.',409);
    result.aiAttempts={...result.aiAttempts,[sourceKey]:{state:'completed',requestId,result:enhanced}};
    run('UPDATE document_imports SET result_json=? WHERE id=?',canonical(result),id);
  }); },
  updateImport({id,state,result=null,errorCode=null}) { return tx(()=> {const row=get('SELECT * FROM document_imports WHERE id=?',id);if(!row) throw new Error('IMPORT_NOT_FOUND');const allowed={queued:['running','failed'],running:['succeeded','failed'],failed:['queued'],succeeded:[]};if(!allowed[row.state].includes(state)) throw new Error('INVALID_IMPORT_TRANSITION');run('UPDATE document_imports SET state=?,result_json=?,error_code=? WHERE id=?',state,result===null?null:canonical(result),errorCode,id);const updated=get('SELECT * FROM document_imports WHERE id=?',id);return {...updated,result:updated.result_json?JSON.parse(updated.result_json):null};}); },
  getFileInternal(id) { return get('SELECT * FROM document_files WHERE id=?',id)??get('SELECT * FROM document_archive_files WHERE id=?',id)??(()=>{const file=get('SELECT * FROM document_attachments WHERE id=?',id);return file?{...file,document_id:file.document_id ?? file.archive_id,purpose:'attachment'}:null;})(); },
  updateJob({id,state,result=null,errorCode=null}) { return tx(()=> {const job=get('SELECT * FROM document_jobs WHERE id=?',id);if(!job) throw new Error('JOB_NOT_FOUND');available(job.document_id);const allowed={queued:['running','failed'],running:['succeeded','failed'],failed:['queued'],succeeded:[]};if(!allowed[job.state].includes(state)) throw new Error('INVALID_JOB_TRANSITION');run('UPDATE document_jobs SET state=?,result_json=?,error_code=? WHERE id=?',state,result===null?null:canonical(result),errorCode,id);return get('SELECT * FROM document_jobs WHERE id=?',id);}); },
  configureSequence({nextNumber,prefix='',suffix=''}) { if(!Number.isSafeInteger(nextNumber)||nextNumber<1||typeof prefix!=='string'||typeof suffix!=='string') throw new Error('INVALID_SEQUENCE'); return tx(()=>{ if(get('SELECT 1 FROM documents WHERE number IS NOT NULL')||get("SELECT 1 FROM document_tombstones WHERE kind='contract' AND number IS NOT NULL")) throw new Error('SEQUENCE_ALREADY_USED'); run("INSERT INTO document_sequences VALUES('contracts',?,?,?) ON CONFLICT(name) DO UPDATE SET next_number=excluded.next_number,prefix=excluded.prefix,suffix=excluded.suffix",nextNumber,prefix,suffix); }); },
  reserveNumber(id) { return tx(()=> { const row=document(id); if(row.kind==='imported_contract')throw documentError('IMPORTED_DOCUMENT_READ_ONLY','Исторический договор доступен только для просмотра.',409);if(row.number) return row.number; if(row.status!=='draft') throw new Error('DOCUMENT_NOT_DRAFT'); const seq=get("SELECT * FROM document_sequences WHERE name='contracts'"); if(!seq) throw new Error('SEQUENCE_NOT_CONFIGURED'); if(seq.next_number>=Number.MAX_SAFE_INTEGER) throw new Error('SEQUENCE_EXHAUSTED'); const number=formatContractNumber(seq); if(get("SELECT id FROM document_tombstones WHERE kind='contract' AND (number=? OR ordinal=?)",number,seq.next_number))throw documentError('SEQUENCE_ALREADY_USED','Номер договора уже использован.',409); run("UPDATE document_sequences SET next_number=next_number+1 WHERE name='contracts'"); run('UPDATE documents SET number=?,ordinal=? WHERE id=?',number,seq.next_number,id); return number; }); },
  createRevision({documentId,entityRevisionId,counterpartySnapshotId,templateVersionId,actorId,date}) { return tx(()=> {
   const doc=document(documentId); if(doc.status!=='draft'||!doc.number) throw new Error('NUMBERED_DRAFT_REQUIRED');
   dateCheck(date);
   const entity=get('SELECT * FROM legal_entity_revisions WHERE id=? AND entity_id=?',entityRevisionId,doc.entity_id);
   const client=get('SELECT * FROM counterparty_snapshots WHERE id=? AND client_id IS ?',counterpartySnapshotId,doc.client_id);
   const template=get('SELECT * FROM document_template_versions WHERE id=? AND entity_id=? AND payment_type=?',templateVersionId,doc.entity_id,doc.payment.type);
   if(!entity||!client||!template) throw new Error('SNAPSHOT_LINK_MISMATCH');
   if(canonical(JSON.parse(client.data_json))!==canonical(doc.draftData.counterparty)||date!==doc.draftData.date) throw new Error('DRAFT_SNAPSHOT_MISMATCH');
   const revision=get('SELECT COALESCE(MAX(revision),0)+1 AS next FROM document_revisions WHERE document_id=?',documentId).next;
     const id=randomUUID(); const snapshot={number:doc.number,date,payment:doc.payment.type==='postpayment'?{...doc.payment,startEvent:POSTPAYMENT_START_EVENT}:doc.payment,entity:JSON.parse(entity.data_json),counterparty:JSON.parse(client.data_json),template:{id:template.id,sha256:template.sha256,config:JSON.parse(template.config_json)}};
   run('INSERT INTO document_revisions VALUES(?,?,?,?,?,?,?,?,?)',id,documentId,revision,entityRevisionId,counterpartySnapshotId,templateVersionId,canonical(snapshot),actorId,now()); return {id,revision,snapshot};
  }); },
  findAttachmentRetry({documentId,actorId,idempotencyKey,title,category,sha256}) {
    if(get('SELECT id FROM document_tombstones WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey))throw documentError('DOCUMENT_PURGED','Этот запрос относится к окончательно удалённому договору.',410);
    if(get('SELECT id FROM documents WHERE actor_id=? AND idempotency_key=? UNION SELECT id FROM document_archive_entries WHERE actor_id=? AND idempotency_key=?',actorId,idempotencyKey,actorId,idempotencyKey))throw documentError('IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован.',409);
    const previous=get('SELECT * FROM document_attachments WHERE created_by=? AND idempotency_key=?',actorId,idempotencyKey);
    if(!previous)return null;
    if((previous.document_id ?? previous.archive_id)!==documentId || previous.title!==title || previous.category!==category || previous.sha256!==sha256)throw documentError('IDEMPOTENCY_CONFLICT','Повторный запрос содержит другие данные.',409);
    return document(documentId);
  },
  addAttachment(input) {return tx(()=>{
    const {documentId,actorId,idempotencyKey,title,category,storageKey,originalName,mime,size,sha256}=input;
    if(get('SELECT role FROM users WHERE id=?',actorId)?.role!=='admin')throw documentError('ADMIN_REQUIRED','Требуется администратор.',403);
    const doc=document(documentId);
    if(doc.status!=='signed')throw documentError('DOCUMENT_STATUS','Дополнительные документы доступны для подписанного договора.',409);
    const retry=this.findAttachmentRetry(input);if(retry)return retry;
    if(!['signed_contract','addendum','accounting','other'].includes(category))throw documentError('DOCUMENT_INPUT_INVALID','Проверьте тип документа.');
    run('INSERT INTO document_attachments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),doc.kind==='imported_contract'?null:documentId,doc.kind==='imported_contract'?documentId:null,category,required(title),required(storageKey),required(originalName),required(mime),size,sha256,actorId,now(),required(idempotencyKey));
    return document(documentId);
  });},
  addFile({documentId,revisionId,purpose,storageKey,originalName,mime,size,sha256,actorId}) { return tx(()=>{document(documentId);const id=randomUUID(); run('INSERT INTO document_files VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,documentId,revisionId,purpose,required(storageKey),required(originalName),required(mime),size,sha256,actorId,now()); return id; }); },
  attachSignedFileAndTransition({documentId,storageKey,originalName,mime,size,sha256,actorId,signedDate=null}) {return tx(()=>{
    const doc=document(documentId);
    if(doc.kind==='imported_contract'||!['generated','sent','signing'].includes(doc.status))throw documentError('DOCUMENT_STATUS','Документ не готов к подписанию.',409);
    if(signedDate!==null)dateCheck(signedDate);
    const revision=get('SELECT id FROM document_revisions WHERE document_id=? ORDER BY revision DESC LIMIT 1',documentId);
    if(!revision)throw documentError('SIGNED_REVISION_REQUIRED','Не найдена версия договора.',409);
    run('INSERT INTO document_files VALUES(?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),documentId,revision.id,'signed',required(storageKey),required(originalName),required(mime),size,sha256,actorId,now());
    run("UPDATE documents SET status='signed',signed_date=COALESCE(?,signed_date) WHERE id=?",signedDate,documentId);
    return document(documentId);
  });},
  transitionStatus({documentId,status,signedDate}) { return tx(()=> {
   const doc=document(documentId), transitions={draft:['generated','cancelled'],generated:['sent','signing','cancelled'],sent:['signing','cancelled'],signing:['signed','cancelled'],signed:['archived'],cancelled:['archived'],archived:[]};
   if(!transitions[doc.status].includes(status)) throw new Error('INVALID_STATUS_TRANSITION');
   const latest=get('SELECT id FROM document_revisions WHERE document_id=? ORDER BY revision DESC LIMIT 1',documentId);
   if(status==='generated' && (!latest || get("SELECT COUNT(*) AS count FROM document_files WHERE revision_id=? AND purpose IN ('docx','pdf')",latest.id).count!==2)) throw new Error('BOTH_OUTPUTS_REQUIRED');
   if(status==='signed') {
    if(!latest || !get("SELECT id FROM document_files WHERE revision_id=? AND purpose='signed'",latest.id)) throw new Error('SIGNED_FILE_REQUIRED');
    if(signedDate!=null) { try { dateCheck(signedDate); } catch {throw new Error('SIGNED_DATE_INVALID');} }
   }
   run('UPDATE documents SET status=?,signed_date=COALESCE(?,signed_date) WHERE id=?',status,status==='signed'?(signedDate ?? null):null,documentId); return document(documentId);
  }); },
  createJob({documentId,kind,idempotencyKey}) { required(idempotencyKey); return tx(()=> { document(documentId); const previous=get('SELECT * FROM document_jobs WHERE document_id=? AND kind=? AND idempotency_key=?',documentId,kind,idempotencyKey); if(previous) return previous; const id=randomUUID(); run('INSERT INTO document_jobs(id,document_id,kind,idempotency_key,created_at) VALUES(?,?,?,?,?)',id,documentId,kind,idempotencyKey,now()); return get('SELECT * FROM document_jobs WHERE id=?',id); }); }
 };
}
