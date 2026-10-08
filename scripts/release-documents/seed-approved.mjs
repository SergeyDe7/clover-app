// Explicit deployment helper. Imports never open the production database.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
export async function seed({appRoot,database,templatesRoot,storageRoot,adminId,resume=false}) {
 const module = relative => import(pathToFileURL(path.join(appRoot,relative)).href);
 const {applyDocumentsPackageSchema,assertDocumentsSchemaReady}=await module('server/src/documents/schema.js');
 const {createDocumentsRepository}=await module('server/src/documents/repository.js');
 const {createDocumentStorage}=await module('server/src/documents/storage.js');
 const db=new DatabaseSync(database,{enableForeignKeyConstraints:true});
 try {
  db.exec('PRAGMA busy_timeout=8000');
  const admin=db.prepare('SELECT id,role,disabled_at FROM users WHERE id=?').get(adminId);
  if(admin?.role!=='admin'||admin.disabled_at!=='')throw new Error('ACTIVE_REAL_ADMIN_REQUIRED');
  const present=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  for(const table of ['documents','document_tombstones','document_archive_entries','document_imports','legal_entities','document_template_versions','document_sequences']) {
   if(!resume&&present.includes(table)&&db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n!==0)throw new Error('EXISTING_DOCUMENT_STATE_REQUIRES_SEPARATE_PLAN');
  }
  const candidates=[];const suppliers=new Map();
  for(const supplier of ['ip','ooo'])for(const buyer of ['ip','ooo'])for(const payment of ['prepayment','postpayment']) {
   const variant=`${supplier}-${buyer}-${payment}`;const dir=path.join(templatesRoot,variant);
   const approval=JSON.parse(readFileSync(path.join(dir,'manifest.private.json'),'utf8'));
   const names=readdirSync(dir).filter(n=>n.endsWith('.template.docx'));
   if(names.length!==1||approval.paymentType!==payment||approval.supplierSourceData?.type!==supplier)throw new Error('APPROVED_TEMPLATE_METADATA_REQUIRED');
   if(JSON.stringify(approval.config?.supplierTypes)!==JSON.stringify([supplier])||JSON.stringify(approval.config?.buyerTypes)!==JSON.stringify([buyer]))throw new Error('TEMPLATE_VARIANT_CONFIG_MISMATCH');
   const buffer=readFileSync(path.join(dir,names[0]));
   if(createHash('sha256').update(buffer).digest('hex')!==approval.templateSha256)throw new Error('PRIVATE_TEMPLATE_HASH_MISMATCH');
   const data=JSON.stringify(approval.supplierSourceData);
   if(suppliers.has(supplier)&&suppliers.get(supplier)!==data)throw new Error('SUPPLIER_METADATA_CONFLICT');
   suppliers.set(supplier,data);candidates.push({supplier,buyer,payment,variant,buffer,approval});
  }
  if(resume) {
   assertDocumentsSchemaReady(db);
   for(const table of ['documents','document_tombstones','document_archive_entries','document_imports','counterparty_snapshots','document_files','document_jobs','document_attachments','document_archive_files'])if(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n!==0)throw new Error('RESUME_BUSINESS_STATE_NOT_EMPTY');
   const seq=db.prepare("SELECT next_number,prefix,suffix FROM document_sequences WHERE name='contracts'").get();
   if(seq?.next_number!==255||seq.prefix!=='1-636/'||seq.suffix!==''||db.prepare('SELECT COUNT(*) AS n FROM document_sequences').get().n!==1)throw new Error('RESUME_SEQUENCE_MISMATCH');
   if(db.prepare('SELECT COUNT(*) AS n FROM legal_entities').get().n!==2||db.prepare('SELECT COUNT(*) AS n FROM legal_entity_revisions').get().n!==2||db.prepare('SELECT COUNT(*) AS n FROM document_template_versions').get().n!==8)throw new Error('RESUME_SEED_COUNTS_MISMATCH');
   const storage=createDocumentStorage(storageRoot,[path.join(appRoot,'dist'),path.join(appRoot,'public'),path.join(appRoot,'server/uploads')]);
   for(const [type,json]of suppliers) {
    const entity=db.prepare('SELECT * FROM legal_entities WHERE id=?').get(`supplier-${type}`),data=JSON.parse(json);
    const revision=db.prepare('SELECT * FROM legal_entity_revisions WHERE entity_id=?').get(`supplier-${type}`);
    if(!entity||entity.active!==1||entity.name!==String(data.fullName||data.shortName||type)||revision?.approved_by!==adminId||!isDeepStrictEqual(JSON.parse(revision.data_json),data))throw new Error('RESUME_SUPPLIER_MISMATCH');
   }
   for(const item of candidates) {
    const row=db.prepare('SELECT * FROM document_template_versions WHERE template_id=?').get(item.variant);
    if(row?.entity_id!==`supplier-${item.supplier}`||row.payment_type!==item.payment||row.approved_by!==adminId||row.sha256!==item.approval.templateSha256||!isDeepStrictEqual(JSON.parse(row.config_json),item.approval.config))throw new Error('RESUME_TEMPLATE_MISMATCH');
    storage.read(row.storage_key,row.sha256);
   }
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('RESUME_FOREIGN_KEY_CHECK_FAILED');
   console.log('PASS guarded resume: exact approved seed preserved; no documents, no reseed, unused sequence255');
   return;
  }
  applyDocumentsPackageSchema(db);assertDocumentsSchemaReady(db);
  const repository=createDocumentsRepository(db);
  const storage=createDocumentStorage(storageRoot,[path.join(appRoot,'dist'),path.join(appRoot,'public'),path.join(appRoot,'server/uploads')]);
  const files=[];
  try {for(const item of candidates)files.push({...item,file:storage.put(item.buffer,'docx')});}
  catch(error){for(const item of files)storage.remove(item.file.key);throw error;}
  db.exec('BEGIN IMMEDIATE');
  try {
   const now=new Date().toISOString();
   for(const [type,json]of suppliers) {
    const data=JSON.parse(json),id=`supplier-${type}`;
    db.prepare('INSERT INTO legal_entities(id,name,active) VALUES(?,?,1)').run(id,String(data.fullName||data.shortName||type));
    db.prepare('INSERT INTO legal_entity_revisions VALUES(?,?,?,?,?)').run(randomUUID(),id,json,adminId,now);
   }
   for(const item of files)db.prepare('INSERT INTO document_template_versions VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),item.variant,`supplier-${item.supplier}`,item.payment,item.file.key,item.file.sha256,JSON.stringify(item.approval.config),adminId,now);
   db.prepare("INSERT INTO document_sequences VALUES('contracts',255,'1-636/','')").run();
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SEED_FOREIGN_KEY_CHECK_FAILED');
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');for(const item of files)storage.remove(item.file.key);throw error;}
  if(repository.getSequence().next_number!==255||db.prepare('SELECT COUNT(*) AS n FROM document_template_versions').get().n!==8)throw new Error('SEED_ACCEPTANCE_FAILED');
  console.log('PASS: additive schema, actual active admin, two entities, eight approved templates, unused sequence255');
 }finally{db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await seed(JSON.parse(readFileSync(process.argv[2],'utf8')));
