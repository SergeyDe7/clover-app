// Explicit, additive migration. Importing this module never opens a database.
export const DOCUMENTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS legal_entities (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
) STRICT;
CREATE TABLE IF NOT EXISTS legal_entity_revisions (
 id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)), approved_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS document_template_versions (
 id TEXT PRIMARY KEY, template_id TEXT NOT NULL, entity_id TEXT NOT NULL REFERENCES legal_entities(id),
 payment_type TEXT NOT NULL CHECK(payment_type IN ('prepayment','postpayment')),
 storage_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 config_json TEXT NOT NULL CHECK(json_valid(config_json)), approved_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS counterparty_snapshots (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)), confirmed_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS counterparty_details (
 client_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 snapshot_id TEXT NOT NULL UNIQUE REFERENCES counterparty_snapshots(id)
) STRICT;
CREATE TABLE IF NOT EXISTS document_sequences (
 name TEXT PRIMARY KEY CHECK(name='contracts'), next_number INTEGER NOT NULL CHECK(next_number>0),
 prefix TEXT NOT NULL, suffix TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 entity_id TEXT NOT NULL REFERENCES legal_entities(id), actor_id TEXT NOT NULL REFERENCES users(id),
 kind TEXT NOT NULL DEFAULT 'contract', parent_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
 payment_json TEXT NOT NULL CHECK(json_valid(payment_json)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','generated','sent','signing','signed','cancelled','archived')),
 idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL, number TEXT UNIQUE, ordinal INTEGER UNIQUE,
 signed_date TEXT, created_at TEXT NOT NULL, UNIQUE(actor_id,idempotency_key)
) STRICT;
CREATE INDEX IF NOT EXISTS documents_client_idx ON documents(client_id,created_at);
CREATE TABLE IF NOT EXISTS document_trash (
 document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE RESTRICT,
 deleted_at TEXT NOT NULL,
 deleted_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE IF NOT EXISTS document_revisions (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0), entity_revision_id TEXT NOT NULL REFERENCES legal_entity_revisions(id),
 counterparty_snapshot_id TEXT NOT NULL REFERENCES counterparty_snapshots(id),
 template_version_id TEXT NOT NULL REFERENCES document_template_versions(id),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 UNIQUE(document_id,revision), UNIQUE(document_id,id)
) STRICT;
CREATE TABLE IF NOT EXISTS document_files (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL, revision_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('docx','pdf','signed')), storage_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 FOREIGN KEY(document_id,revision_id) REFERENCES document_revisions(document_id,id) ON DELETE RESTRICT
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS document_output_unique ON document_files(revision_id,purpose) WHERE purpose IN ('docx','pdf');
CREATE TABLE IF NOT EXISTS document_jobs (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id),
 kind TEXT NOT NULL CHECK(kind IN ('recognition','generation')), idempotency_key TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), error_code TEXT,
 created_at TEXT NOT NULL, started_at INTEGER, lease_token TEXT, lease_expires_at INTEGER,
 UNIQUE(document_id,kind,idempotency_key)
) STRICT;
CREATE TABLE IF NOT EXISTS document_archive_entries (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 entity_id TEXT NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT, actor_id TEXT NOT NULL REFERENCES users(id),
 historical_number TEXT NOT NULL, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT, deleted_by TEXT REFERENCES users(id),
 UNIQUE(actor_id,idempotency_key)
) STRICT;
CREATE TABLE IF NOT EXISTS document_archive_files (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES document_archive_entries(id) ON DELETE RESTRICT,
 purpose TEXT NOT NULL CHECK(purpose IN ('original_scan','signed')), storage_key TEXT NOT NULL UNIQUE,
 original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64), created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS document_imports (
 id TEXT PRIMARY KEY, client_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES users(id), storage_key TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed')),
 error_code TEXT, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS document_attachments (
 id TEXT PRIMARY KEY, document_id TEXT REFERENCES documents(id) ON DELETE RESTRICT,
 archive_id TEXT REFERENCES document_archive_entries(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('signed_contract','addendum','accounting','other')),
 title TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
 mime TEXT NOT NULL, size INTEGER NOT NULL CHECK(size>0), sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, idempotency_key TEXT NOT NULL,
 CHECK((document_id IS NULL) != (archive_id IS NULL)), UNIQUE(created_by,idempotency_key)
) STRICT;
CREATE TABLE IF NOT EXISTS document_tombstones (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, number TEXT, ordinal INTEGER,
 actor_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, purged_at TEXT NOT NULL,
 pending_keys_json TEXT NOT NULL CHECK(json_valid(pending_keys_json)), UNIQUE(actor_id,idempotency_key)
) STRICT;
CREATE TABLE IF NOT EXISTS document_purge_permissions (
 table_name TEXT NOT NULL, record_id TEXT NOT NULL, PRIMARY KEY(table_name,record_id)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS document_tombstones_ordinal ON document_tombstones(ordinal) WHERE kind='contract';
CREATE TRIGGER IF NOT EXISTS document_tombstones_no_delete BEFORE DELETE ON document_tombstones BEGIN SELECT RAISE(ABORT,'DOCUMENT_DELETE_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS document_tombstones_immutable_update BEFORE UPDATE ON document_tombstones
 WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.number IS NOT OLD.number OR NEW.ordinal IS NOT OLD.ordinal
 OR NEW.actor_id IS NOT OLD.actor_id OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.purged_at IS NOT OLD.purged_at
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_RECORD'); END;
${['legal_entity_revisions','document_template_versions','counterparty_snapshots','document_revisions','document_files','document_archive_files','document_attachments'].map(table => `
CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_RECORD'); END;
DROP TRIGGER IF EXISTS ${table}_immutable_delete;
CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} WHEN NOT EXISTS(SELECT 1 FROM document_purge_permissions WHERE table_name='${table}' AND record_id=OLD.id) BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_RECORD'); END;`).join('')}
DROP TRIGGER IF EXISTS documents_no_delete;
CREATE TRIGGER documents_no_delete BEFORE DELETE ON documents WHEN NOT EXISTS(SELECT 1 FROM document_purge_permissions WHERE table_name='documents' AND record_id=OLD.id) BEGIN SELECT RAISE(ABORT,'DOCUMENT_DELETE_FORBIDDEN'); END;
DROP TRIGGER IF EXISTS document_archive_entries_no_delete;
CREATE TRIGGER document_archive_entries_no_delete BEFORE DELETE ON document_archive_entries WHEN NOT EXISTS(SELECT 1 FROM document_purge_permissions WHERE table_name='document_archive_entries' AND record_id=OLD.id) BEGIN SELECT RAISE(ABORT,'DOCUMENT_DELETE_FORBIDDEN'); END;
CREATE TRIGGER IF NOT EXISTS document_archive_entries_metadata_immutable BEFORE UPDATE ON document_archive_entries
 WHEN NEW.id IS NOT OLD.id OR NEW.client_id IS NOT OLD.client_id OR NEW.entity_id IS NOT OLD.entity_id
 OR NEW.actor_id IS NOT OLD.actor_id OR NEW.historical_number IS NOT OLD.historical_number OR NEW.metadata_json IS NOT OLD.metadata_json
 OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.created_at IS NOT OLD.created_at
 BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DOCUMENT_RECORD'); END;
`;

// Rollback is for a verified empty module only. Never discard populated documents.
export const DOCUMENTS_ROLLBACK_SQL = `
CREATE TEMP TABLE documents_rollback_guard(value INTEGER);
CREATE TEMP TRIGGER documents_rollback_check BEFORE INSERT ON documents_rollback_guard
WHEN EXISTS(SELECT 1 FROM document_tombstones) OR EXISTS(SELECT 1 FROM documents) OR EXISTS(SELECT 1 FROM document_archive_entries) OR EXISTS(SELECT 1 FROM counterparty_snapshots) OR EXISTS(SELECT 1 FROM document_imports)
 OR EXISTS(SELECT 1 FROM legal_entity_revisions) OR EXISTS(SELECT 1 FROM document_template_versions)
BEGIN SELECT RAISE(ABORT,'RESTORE_VERIFIED_BACKUP_REQUIRED'); END;
INSERT INTO documents_rollback_guard VALUES(1);
DROP TABLE document_purge_permissions;
DROP TABLE document_tombstones;
DROP TABLE document_imports;
DROP TABLE document_jobs;
DROP TABLE document_attachments;
DROP TABLE document_files;
DROP TABLE document_archive_files;
DROP TABLE document_archive_entries;
DROP TABLE document_revisions;
DROP TABLE document_trash;
DROP TABLE documents;
DROP TABLE document_sequences;
DROP TABLE counterparty_details;
DROP TABLE counterparty_snapshots;
DROP TABLE document_template_versions;
DROP TABLE legal_entity_revisions;
DROP TABLE legal_entities;
DROP TABLE documents_rollback_guard;
`;

// Complete table/column readiness. Never repairs or migrates an installed database.
export const DOCUMENTS_SCHEMA_COLUMNS = Object.freeze({
 users:['id','role'],
 document_purge_permissions:['table_name','record_id'],document_tombstones:['id','kind','number','ordinal','actor_id','idempotency_key','purged_at','pending_keys_json'],
 legal_entities:['id','name','active'],legal_entity_revisions:['id','entity_id','data_json','approved_by','created_at'],
 document_template_versions:['id','template_id','entity_id','payment_type','storage_key','sha256','config_json','approved_by','created_at'],
 counterparty_snapshots:['id','client_id','data_json','confirmed_by','created_at'],counterparty_details:['client_id','snapshot_id'],
 document_sequences:['name','next_number','prefix','suffix'],
 documents:['id','client_id','entity_id','actor_id','kind','parent_id','payment_json','status','idempotency_key','request_json','number','ordinal','signed_date','created_at'],
 document_trash:['document_id','deleted_at','deleted_by'],
 document_revisions:['id','document_id','revision','entity_revision_id','counterparty_snapshot_id','template_version_id','snapshot_json','created_by','created_at'],
 document_files:['id','document_id','revision_id','purpose','storage_key','original_name','mime','size','sha256','created_by','created_at'],
 document_archive_files:['id','document_id','purpose','storage_key','original_name','mime','size','sha256','created_by','created_at'],
 document_attachments:['id','document_id','archive_id','category','title','storage_key','original_name','mime','size','sha256','created_by','created_at','idempotency_key'],
 document_archive_entries:['id','client_id','entity_id','actor_id','historical_number','metadata_json','idempotency_key','created_at','deleted_at','deleted_by'],
 document_jobs:['id','document_id','kind','idempotency_key','state','result_json','error_code','created_at','started_at','lease_token','lease_expires_at'],
 document_imports:['id','client_id','actor_id','storage_key','sha256','result_json','state','error_code','created_at'],
});
export function assertDocumentsSchemaReady(db) {
 for(const table of ['documents','counterparty_snapshots','document_imports']) {
  if(db.prepare(`PRAGMA table_info(${table})`).all().find(row=>row.name==='client_id')?.notnull!==0)throw Object.assign(new Error('Standalone document schema unavailable'),{code:'DOCUMENTS_SCHEMA_REQUIRED'});
 }
 for(const [table,columns] of Object.entries(DOCUMENTS_SCHEMA_COLUMNS)) {
  const actual=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name));
  if(columns.some(column=>!actual.has(column)))throw Object.assign(new Error('Document schema unavailable'),{code:'DOCUMENTS_SCHEMA_REQUIRED'});
 }
}

export function applyDocumentsSchema(db) {
 db.exec('PRAGMA foreign_keys = ON');
 if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1) throw new Error('FOREIGN_KEYS_REQUIRED');
 db.exec('BEGIN IMMEDIATE');
 try { db.exec(DOCUMENTS_SCHEMA_SQL); db.exec('COMMIT'); }
 catch (error) { db.exec('ROLLBACK'); throw error; }
}

// Explicit operator migration only. Never called from runtime or ordinary schema creation.
export function applyStandaloneDocumentsSchema(db) {
 if(db.isTransaction)throw new Error('TRANSACTION_ALREADY_ACTIVE');
 const foreignKeys=db.prepare('PRAGMA foreign_keys').get().foreign_keys;
 if(foreignKeys!==1)throw new Error('FOREIGN_KEYS_REQUIRED');
 db.exec('PRAGMA foreign_keys=OFF');
 try {
  db.exec('BEGIN IMMEDIATE');
  const preservedObjects=db.prepare("SELECT tbl_name,sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name IN ('documents','counterparty_snapshots','document_imports') AND sql IS NOT NULL").all();
  const rebuilt=new Set();
  for(const table of ['documents','counterparty_snapshots','document_imports']) {
   const columns=db.prepare(`PRAGMA table_info(${table})`).all();
   if(!columns.length)throw new Error('DOCUMENTS_SCHEMA_REQUIRED');
   if(columns.find(row=>row.name==='client_id')?.notnull===0)continue;
   const original=db.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?').get(table).sql;
   const sql=original.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:"([^" ]+)"|([\w]+))/i,`CREATE TABLE ${table}_standalone_new`).replace(/client_id TEXT NOT NULL/i,'client_id TEXT');
   if(sql===original||/client_id TEXT NOT NULL/i.test(sql))throw new Error('DOCUMENTS_MIGRATION_UNSUPPORTED');
   rebuilt.add(table);
   db.exec(sql);
   const names=columns.map(row=>`"${row.name}"`).join(',');
   db.exec(`INSERT INTO ${table}_standalone_new (${names}) SELECT ${names} FROM ${table}`);
   db.exec(`DROP TABLE ${table}`);
   db.exec(`ALTER TABLE ${table}_standalone_new RENAME TO ${table}`);
  }
  for(const object of preservedObjects)if(rebuilt.has(object.tbl_name))db.exec(object.sql);
  db.exec(DOCUMENTS_SCHEMA_SQL); // Restore only dropped indexes and immutable triggers.
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('FOREIGN_KEYS_INVALID');
  assertDocumentsSchemaReady(db);
  db.exec('COMMIT');
 } catch(error) { if(db.isTransaction)db.exec('ROLLBACK');throw error; }
 finally {db.exec('PRAGMA foreign_keys=ON');}
}

// Explicit additive package migration, invoked only by an operator with backup.
export function applyDocumentsPackageSchema(db) {
 if(db.isTransaction)throw new Error('TRANSACTION_ALREADY_ACTIVE');
 if(db.prepare('PRAGMA foreign_keys').get().foreign_keys!==1)throw new Error('FOREIGN_KEYS_REQUIRED');
 db.exec('BEGIN IMMEDIATE');
 try {db.exec(DOCUMENTS_SCHEMA_SQL);assertDocumentsSchemaReady(db);if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('FOREIGN_KEYS_INVALID');db.exec('COMMIT');}
 catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}
