import express from "express";
import multer from "multer";
import { z } from "zod";
import { documentCapabilities } from "./policy.js";
import { documentError, DOCUMENT_MAX_BYTES, inspectDocumentUpload } from "./storage.js";
import { readCardSources, completeRecognizedFields, recognizeFields } from "./extraction.js";
import { enhanceCardWithAI } from "./aiExtraction.js";
import { decideCardAINeed } from "../../../src/shared/contracts/aiNeed.js";
import { DisabledAIProvider } from "./providers.js";
import { validateCounterparty, validateTemplateText } from "./validation.js";
import { DEFAULT_CONTRACT_SEQUENCE, POSTPAYMENT_START_WORDING } from "./businessRules.js";
import { renderDocx } from "./engine.js";
import { randomUUID } from "node:crypto";
import { validateSignedDocument } from "./fileValidation.js";
import { validInn } from "./validation.js";
import { verifyCounterparty } from './counterpartyVerification.js';

const counterpartyKeys = ["type", "fullName", "inn", "kpp", "ogrn", "ogrnip", "legalAddress", "postalAddress", "bankName", "bik", "settlementAccount", "correspondentAccount", "signerFullName", "signerFullNameGenitive", "signerPosition", "signerPositionGenitive", "authorityBasis", "phone", "accountingPhone", "email", "edo"];
const fields = z.object(Object.fromEntries(counterpartyKeys.map((key) => [key, z.string().max(2000).optional()]))).strict();
const draftSchema = z.object({ legalEntityId: z.string().min(1).max(100), date: z.string().max(10),
  payment: z.object({ type: z.enum(["prepayment", "postpayment"]), days: z.number().int().positive().max(9999).nullable().optional() }).strict(),
  counterparty: fields, verification: z.object({choices:z.object(Object.fromEntries(["type","fullName","inn","kpp","ogrn","ogrnip","legalAddress"].map(key=>[key,z.enum(["original","registry"]).optional()]))).strict(),expectedRegistry:z.object(Object.fromEntries(["type","fullName","inn","kpp","ogrn","ogrnip","legalAddress"].map(key=>[key,z.string().max(2000).optional()]))).strict().optional()}).strict().optional(), confirmed: z.boolean(), importId: z.string().uuid().nullable().optional(), idempotencyKey: z.string().min(1).max(100) }).strict();
const safeDocument = (doc) => ({ id: doc.id, clientId: doc.clientId, entityId: doc.entityId, kind:doc.kind, folder:doc.kind==='imported_contract'?doc.folder:'clients', number: doc.number, status: doc.status,
  createdAt: doc.createdAt, counterparty: {type:doc.draftData.counterparty.type, fullName:doc.draftData.counterparty.fullName, inn:doc.draftData.counterparty.inn}, files: doc.status === "draft" ? [] : doc.files.map((file) => ({ id: file.id, type: file.type, name: file.name, ...(file.type === "attachment" ? { category:file.category,title:file.title,createdAt:file.createdAt } : {}) })) });

// Runtime is injected, so tests never import the production DB or start the server.
export function createDocumentsRouter({ enabled = false, runtimeError, repository: repo, storage, service, authRequired,
  findUser, clientLink = () => ({}), config = {}, audit = () => {}, aiProvider = new DisabledAIProvider(), verificationAdapters = {} } = {}) {
  const router = express.Router();
  const aiRequests = new Map();
  let aiActive = 0;
  const publicImportResult = result => Object.fromEntries(Object.entries(result || {}).filter(([key]) => key !== 'aiAttempts'));
  const aiInput = z.object({ consent: z.literal(true), sheetId: z.string().regex(/^sheet-\d{1,3}$/).optional() }).strict();
  router.use(authRequired);
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1, fields: 8, fieldSize: 32768 } }).single("file");
  function client(req, rawId) {
    const id = rawId === "me" ? req.user.id : rawId;
    if (findUser(id)?.role !== "client") throw documentError("CLIENT_NOT_FOUND", "Клиент не найден.", 404);
    return id;
  }
  function capabilities(req, clientId) {
    return documentCapabilities(req.user, clientId, { assignedManagerId: clientLink(clientId)?.personalManagerId,
      grants: config.grants, clientCreate: config.clientCreate });
  }
  function requireAction(req, clientId, action) {
    if(clientId===null){if(req.user.role==='admin'&&!req.user.disabled_at)return;throw documentError('DOCUMENT_FORBIDDEN','Недостаточно прав на документы этого клиента.',403);}
    if (!capabilities(req, clientId)[action]) throw documentError("DOCUMENT_FORBIDDEN", "Недостаточно прав на документы этого клиента.", 403);
  }
  function authorizedDocument(req,id,action) {
    const metadata=repo.getDocument(id,{includeTrashed:true});
    requireAction(req,metadata.clientId,action);
    return repo.getDocument(id);
  }
  function ready() {
    if (!enabled || runtimeError) throw documentError(runtimeError || "DOCUMENTS_DISABLED", "Модуль документов не настроен. Требуется подготовка TEST-контура.", 503);
  }
  const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  const verificationSources = ['fns', 'arbitration', 'fssp', 'bankruptcy'].map(id => ({ id, configured: typeof verificationAdapters[id] === 'function' }));
  router.post('/admin/generator/verify-counterparty', wrap(async (req, res) => {
    ready(); requireAction(req, null, 'create');
    const input = z.object({ counterparty: fields }).strict().parse(req.body);
    // Only server-owned adapters can perform lookups. The browser cannot supply
    // URLs, credentials, source results, or a replacement provider.
    const report = await verifyCounterparty({ fields: input.counterparty, adapters: verificationAdapters });
    audit(req, 'document_counterparty_verification', { status: report.status, sources: report.sources.map(({ id, status }) => ({ id, status })) });
    res.json(report);
  }));
  router.get(["/clients/:clientId/options", "/admin/generator/options"], wrap((req, res) => {
    const id = req.params.clientId === undefined ? null : client(req, req.params.clientId);
    requireAction(req, id, "view");
    if (!enabled || runtimeError) return res.json({ enabled: false, legalEntities: [], capabilities: { view: true, create: false, uploadSigned: false },
      blockers: [{ code: runtimeError || "DOCUMENTS_DISABLED", message: "Модуль документов ещё не настроен для этой среды." }] });
    const entities = repo.listLegalEntities();
    const blockers = [];
    if (!entities.length) blockers.push({ code: "LEGAL_ENTITIES_REQUIRED", message: "Добавьте юридические лица и утвердите реквизиты." });
    if (!repo.getSequence()) blockers.push({ code: "SEQUENCE_NOT_CONFIGURED", message: "Начальный номер договора не задан." });
    res.json({ enabled: true, clientId: id, legalEntities: entities.map(({ id, name }) => ({ id, name })), capabilities: id === null ? {view:true,create:true,uploadSigned:true,delete:true,attachDocuments:true} : capabilities(req, id), blockers,
      verification: { configured: verificationSources.some(source => source.configured), required: config.fnsVerificationRequired === true, blocking: false, sources: verificationSources },
      ai: {...aiProvider.status(),onlyWhenNeeded:config.aiOnlyWhenNeeded===true,autoRecognition:config.aiAutoRecognition===true && req.user.role==="admin" && !req.user.disabled_at} });
  }));
  router.use((_req, _res, next) => { try { ready(); next(); } catch (error) { next(error); } });
  router.get("/archive", wrap((req,res) => {
    const inn=z.string().regex(/^\d{0,12}$/).parse(req.query.inn || '');
    const documents=[];
    for(const clientId of repo.listDocumentClientIds()) {
      if(findUser(clientId)?.role !== 'client') continue;
      const rights=capabilities(req,clientId);
      if(!rights.view) continue;
      for(const doc of repo.listDocuments(clientId)) {
        if(!String(doc.draftData.counterparty.inn || '').includes(inn)) continue;
        documents.push({...safeDocument(doc),canUploadSigned:doc.kind!=='imported_contract'&&rights.uploadSigned,canCreate:doc.kind!=='imported_contract'&&rights.create,canDelete:rights.delete,canRestore:false,canAttachDocuments:req.user.role==='admin'&&!req.user.disabled_at&&doc.status==='signed'});
      }
    }
    if(req.user.role==='admin'&&!req.user.disabled_at)for(const doc of repo.listStandaloneDocuments()){
      if(String(doc.draftData.counterparty.inn || '').includes(inn))documents.push({...safeDocument(doc),canUploadSigned:doc.kind!=='imported_contract',canCreate:doc.kind!=='imported_contract',canDelete:true,canRestore:false,canAttachDocuments:req.user.role==='admin'&&!req.user.disabled_at&&doc.status==='signed'});
    }
    documents.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id));
    res.json({documents});
  }));
  router.get("/clients/:clientId", wrap((req, res) => {
    const id = client(req, req.params.clientId); requireAction(req, id, "view");
    res.json({ documents: repo.listDocuments(id).map(safeDocument) });
  }));
  router.post(["/clients/:clientId/validate", "/admin/generator/validate"], wrap((req, res) => {
    const id = req.params.clientId === undefined ? null : client(req, req.params.clientId); requireAction(req, id, "create");
    const input = draftSchema.parse(req.body); const result = service.validate(input);
    res.json({ valid: result.valid, errors: result.errors, warnings: result.warnings, checks:result.checks });
  }));
  router.post(["/clients/:clientId/drafts", "/admin/generator/drafts"], wrap(async (req, res) => {
    const id = req.params.clientId === undefined ? null : client(req, req.params.clientId); requireAction(req, id, "create");
    const input = draftSchema.parse(req.body);
    const validation = service.validate(input, { generation: false });
    if (!validation.valid) return res.status(422).json({ error: "Исправьте реквизиты черновика.", code: "DOCUMENT_VALIDATION", errors: validation.errors });
    if (input.importId) {
      const imported = repo.getImport(input.importId);
      if (!imported || imported.clientId !== id) throw documentError("DOCUMENT_IMPORT_FORBIDDEN", "Карточка относится к другому клиенту.", 403);
    }
    const document = await service.createDraft({ clientId: id, entityId: input.legalEntityId, payment: input.payment,
      counterparty: input.counterparty, confirmed:input.confirmed, verification:input.verification, date: input.date, importId:input.importId, actorId: req.user.id, idempotencyKey: input.idempotencyKey });
    audit(req, "document.create", { documentId: document.id, clientId: id });
    audit(req, "document.requisites.confirm", { documentId: document.id, clientId: id });
    res.status(201).json({ document: safeDocument(document), ...(document.draftData.verification?{verification:document.draftData.verification}:{}) });
  }));
  // Scope authorization runs BEFORE multer reads a card into memory.
  router.post(["/clients/:clientId/imports", "/admin/generator/imports"], (req, _res, next) => {
    try { req.documentClientId = req.params.clientId === undefined ? null : client(req, req.params.clientId); requireAction(req, req.documentClientId, "create"); next(); } catch (error) { next(error); }
  },
    (req, res, next) => upload(req, res, next), wrap(async (req, res) => {
      if (!req.file) throw documentError("DOCUMENT_FILE_REQUIRED", "Выберите карточку клиента.");
      const checked = inspectDocumentUpload(req.file.buffer, req.file.originalname);
      const file = storage.put(req.file.buffer, checked.extension);
      const imported = repo.createImport({ clientId: req.documentClientId, actorId: req.user.id, storageKey: file.key, sha256: file.sha256 });
      repo.updateImport({ id: imported.id, state: "running" });
      audit(req, "document.card.upload", { importId: imported.id, bytes: file.size });
      try {
        const sources = await readCardSources(req.file.buffer, { extension: checked.extension, adapters: config.adapters });
        const analyze = text => { const local=completeRecognizedFields(recognizeFields(text)); return {...local,aiNeed:decideCardAINeed(local,text)}; };
        const result = analyze(sources.text);
        if(sources.sheets?.length>1) result.alternatives=sources.sheets.filter(sheet=>sheet.text.trim()).map((sheet,index)=>({id:`sheet-${index}`,label:sheet.name,...analyze(sheet.text)}));
        repo.updateImport({ id: imported.id, state: "succeeded", result });
        res.status(201).json({ id: imported.id, status: "succeeded", ...result });
      } catch (error) {
        repo.updateImport({ id: imported.id, state: "failed", errorCode: error.code || "EXTRACTION_FAILED" });
        throw error;
      }
    }));
  router.get("/imports/:id", wrap((req, res) => {
    const imported = repo.getImport(req.params.id);
    if (!imported) throw documentError("IMPORT_NOT_FOUND", "Карточка не найдена.", 404);
    requireAction(req, imported.clientId, "create");
    res.json({ id: imported.id, status: imported.state, ...publicImportResult(imported.result), code: imported.error_code });
  }));
  const requireAdmin=req=>{if(req.user.role!=="admin" || req.user.disabled_at)throw documentError("ADMIN_REQUIRED","Требуется администратор.",403);};
  router.get("/trash",wrap((req,res)=>{
    requireAdmin(req);
    res.json({documents:repo.listTrashedDocuments().map(doc=>({...safeDocument(doc),files:[],deletedAt:doc.deletedAt,canRestore:true,canPurge:true,canDelete:false,canCreate:false,canUploadSigned:false})).concat(repo.listPendingPurges().map(row=>({id:row.id,kind:row.kind,number:row.number,status:'purging',counterparty:{fullName:'',inn:''},files:[],deletedAt:row.purged_at,canRestore:false,canPurge:true,canDelete:false,canCreate:false,canUploadSigned:false})))});
  }));
  router.post("/:id/trash",wrap((req,res)=>{
    requireAdmin(req);z.object({confirmed:z.literal(true)}).strict().parse(req.body);
    const result=repo.trashDocument({documentId:req.params.id,actorId:req.user.id});
    audit(req,"document.trash",{documentId:result.id});res.json(result);
  }));
  router.post('/:id/purge',wrap((req,res)=>{
    requireAdmin(req);z.object({confirmed:z.literal(true)}).strict().parse(req.body);
    const tombstone=repo.preparePurge({documentId:req.params.id,actorId:req.user.id});
    for(const key of JSON.parse(tombstone.pending_keys_json))storage.remove(key);
    repo.completePurge(tombstone.id);audit(req,'document.purge',{documentId:tombstone.id,number:tombstone.number});
    res.json({id:tombstone.id,purged:true,number:tombstone.number});
  }));
  router.post("/:id/restore",wrap((req,res)=>{
    requireAdmin(req);z.object({confirmed:z.literal(true)}).strict().parse(req.body);
    const document=repo.restoreDocument({documentId:req.params.id,actorId:req.user.id});
    audit(req,"document.restore",{documentId:document.id});res.json({document:{...safeDocument(document),canDelete:true,canRestore:false,canAttachDocuments:document.status==='signed'}});
  }));
  router.post('/imports/:id/ai',wrap(async(req,res)=>{
    const imported=repo.getImport(req.params.id);
    if(!imported)throw documentError('IMPORT_NOT_FOUND','Карточка не найдена.',404);
    requireAction(req,imported.clientId,'create');
    const input=aiInput.parse(req.body);
    if(imported.state!=='succeeded')throw documentError('AI_IMPORT_NOT_READY','Сначала распознайте карточку локально.',409);
    if(!aiProvider.status().available)throw documentError('AI_NOT_CONFIGURED','ИИ не настроен или внешняя обработка не согласована.',503);
    const alternatives=imported.result?.alternatives || [];
    if(alternatives.length>1 && !input.sheetId)throw documentError('AI_SHEET_REQUIRED','Выберите лист с карточкой клиента.',422);
    const selected=input.sheetId?alternatives.find(item=>item.id===input.sheetId):null;
    if(input.sheetId && !selected)throw documentError('AI_SHEET_INVALID','Выбранный лист отсутствует в этой карточке.',422);
    const sourceKey=input.sheetId || 'document';
    const previous=imported.result?.aiAttempts?.[sourceKey];
    if(previous?.state==='completed')return res.json({id:imported.id,status:'succeeded',...previous.result,fromCache:true});
    if(previous)throw documentError('AI_ATTEMPT_RESERVED','Предыдущая попытка уже начата. Повторная отправка этой карточки заблокирована.',409);
    const buffer=storage.read(imported.storageKey,imported.sha256);
    const extension=imported.storageKey.split('.').pop();
    const sources=await readCardSources(buffer,{extension,adapters:config.adapters});
    const source=input.sheetId?sources.sheets?.filter(item=>item.text.trim())[Number(input.sheetId.slice(6))]:null;
    if(input.sheetId && (!source || source.name!==selected.label))throw documentError('AI_SHEET_INVALID','Не удалось подтвердить выбранный лист.',422);
    const text=source?.text || sources.text;
    // Recompute facts from the stored original; neither browser nor persisted hints authorize spend.
    const local=completeRecognizedFields(recognizeFields(text));
    const aiNeed=decideCardAINeed(local,text);
    if(config.aiOnlyWhenNeeded===true && !aiNeed.needed)return res.json({id:imported.id,status:'succeeded',...local,aiNeed,ai:{status:'skipped',provider:'local',reason:aiNeed.reason}});
    const timestamp=Date.now();
    for(const [actor,entry] of aiRequests)if(timestamp-entry.startedAt>=60000)aiRequests.delete(actor);
    const usage=aiRequests.get(req.user.id) || {startedAt:timestamp,count:0};
    if(aiActive>=2 || usage.count>=3 || aiRequests.size>=5000)throw documentError('AI_RATE_LIMIT','Слишком много запросов ИИ. Попробуйте позже.',429);
    usage.count++;aiRequests.set(req.user.id,usage);aiActive++;
    try {
      const reservation=repo.reserveImportAI({id:imported.id,sourceKey});
      if(reservation.existing?.state==='completed')return res.json({id:imported.id,status:'succeeded',...reservation.existing.result,fromCache:true});
      if(reservation.existing)throw documentError('AI_ATTEMPT_RESERVED','Предыдущая попытка уже начата. Повторная отправка заблокирована.',409);
      audit(req,'document.card.ai.request',{importId:imported.id,sheetId:input.sheetId || null,provider:'openai',consent:true});
      const enhanced=await enhanceCardWithAI(local,text,aiProvider);
      enhanced.aiNeed=decideCardAINeed(enhanced,text);
      repo.finishImportAI({id:imported.id,sourceKey,requestId:reservation.requestId,result:enhanced});
      audit(req,'document.card.ai.result',{importId:imported.id,status:enhanced.ai?.status,provider:'openai'});
      res.json({id:imported.id,status:'succeeded',...enhanced});
    } finally {aiActive--;}
  }));
  router.get("/:id/review",wrap((req,res)=>{
    const document=authorizedDocument(req,req.params.id,"create");
    if(document.kind==='imported_contract')throw documentError('IMPORTED_DOCUMENT_READ_ONLY','Исторический договор доступен только для просмотра.',409);
    const validation=service.reviewForGeneration(document);
    res.json({id:document.id,clientId:document.clientId,entityId:document.entityId,date:document.draftData.date,
      payment:document.payment,counterparty:document.draftData.counterparty,checks:validation.checks,
      validation:{valid:validation.valid,errors:validation.errors,warnings:validation.warnings}});
  }));
  router.post("/:id/generate", wrap(async (req, res) => {
    const document = authorizedDocument(req,req.params.id,"create");
    if(document.kind==='imported_contract')throw documentError('IMPORTED_DOCUMENT_READ_ONLY','Исторический договор доступен только для просмотра.',409);
    const job = await service.generate(document.id, req.user.id);
    audit(req, "document.generate", { documentId: document.id, jobId: job.id }); res.json({ job });
  }));
  router.get("/jobs/:id", wrap((req, res) => {
    const job = repo.getJob(req.params.id);
    if (!job) throw documentError("JOB_NOT_FOUND", "Задание не найдено.", 404);
    authorizedDocument(req,job.document_id,"view");
    res.json({ id: job.id, status: job.state, code: job.error_code });
  }));
  router.get("/:id/files/:fileId", wrap((req, res) => {
    const document = authorizedDocument(req,req.params.id,"view");
    const file = repo.getFileInternal(req.params.fileId);
    if (!file || file.document_id !== document.id || document.status === "draft") throw documentError("FILE_NOT_FOUND", "Файл не найден.", 404);
    const buffer = storage.read(file.storage_key, file.sha256);
    const extension = file.mime === "image/png" ? "png" : file.mime === "image/jpeg" ? "jpg" : file.purpose === "docx" ? "docx" : "pdf";
    res.type(file.mime).set("Content-Disposition", `attachment; filename="document.${extension}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    res.set("X-Content-Type-Options", "nosniff"); audit(req, "document.download", { documentId: document.id, fileId: file.id }); res.send(buffer);
  }));
  router.post('/:id/attachments',(req,_res,next)=>{
    try {requireAdmin(req);const doc=authorizedDocument(req,req.params.id,'view');if(doc.status!=='signed')throw documentError('DOCUMENT_STATUS','Дополнительные документы доступны для подписанного договора.',409);next();}catch(error){next(error);}
  },upload,wrap(async(req,res)=>{
    const input=z.object({title:z.string().trim().min(1).max(200),category:z.enum(['signed_contract','addendum','accounting','other']),idempotencyKey:z.string().min(1).max(100)}).strict().parse(req.body);
    if(!req.file)throw documentError('DOCUMENT_FILE_REQUIRED','Выберите документ.');
    const checked=inspectDocumentUpload(req.file.buffer,req.file.originalname,true);
    await validateSignedDocument(req.file.buffer,checked.extension,{python:config.fileValidatorPython});
    const doc=authorizedDocument(req,req.params.id,'view');
    if(doc.status!=='signed')throw documentError('DOCUMENT_STATUS','Дополнительные документы доступны для подписанного договора.',409);
    const data={...input,documentId:doc.id,actorId:req.user.id,sha256:checked.sha256};
    let updated=repo.findAttachmentRetry(data);
    if(!updated){const file=storage.put(req.file.buffer,checked.extension);try {updated=repo.addAttachment({...data,storageKey:file.key,size:file.size,originalName:req.file.originalname.slice(0,180),mime:checked.extension==='pdf'?'application/pdf':checked.extension==='png'?'image/png':'image/jpeg'});}catch(error){storage.remove(file.key);throw error;}}
    audit(req,'document.attachment.upload',{documentId:doc.id,category:input.category});
    res.status(201).json({document:{...safeDocument(updated),canAttachDocuments:true}});
  }));
  router.post("/:id/signed-files", (req, _res, next) => {
    try { authorizedDocument(req,req.params.id,"uploadSigned"); next(); } catch (error) { next(error); }
  }, upload, wrap(async (req, res) => {
    const doc = repo.getDocument(req.params.id);
    if (!["generated", "sent", "signing"].includes(doc.status)) throw documentError("DOCUMENT_STATUS", "Документ не готов к подписанию.", 409);
    if (!req.file) throw documentError("DOCUMENT_FILE_REQUIRED", "Выберите подписанный файл.");
    const date = req.body.date === undefined || req.body.date === '' ? null : req.body.date;
    if (date !== null && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
      throw documentError("SIGNED_DATE_INVALID", "Проверьте дату подписания.");
    }
    const checked = inspectDocumentUpload(req.file.buffer, req.file.originalname, true);
    await validateSignedDocument(req.file.buffer,checked.extension,{python:config.fileValidatorPython});
    const current=authorizedDocument(req,req.params.id,'uploadSigned');
    if(!['generated','sent','signing'].includes(current.status))throw documentError('DOCUMENT_STATUS','Документ не готов к подписанию.',409);
    const file = storage.put(req.file.buffer, checked.extension);
    const updated=repo.attachSignedFileAndTransition({ documentId: doc.id, storageKey: file.key,
      originalName: req.file.originalname.slice(0, 180), mime: checked.extension === "pdf" ? "application/pdf" : checked.extension === "png" ? "image/png" : "image/jpeg",
      size: file.size, sha256: file.sha256, actorId: req.user.id, signedDate:date });
    audit(req, "document.signed.upload", { documentId: doc.id }); audit(req, "document.status.signed", { documentId: doc.id });
    res.json({ document: {...safeDocument(updated),canAttachDocuments:req.user.role==='admin'&&!req.user.disabled_at&&updated.status==='signed'} });
  }));
  // Admin-only explicit setup; agreed defaults never initialize the DB at server startup.
  router.use("/admin", (req, _res, next) => { if (req.user.role !== "admin") return next(documentError("ADMIN_REQUIRED", "Требуется администратор.", 403)); next(); });
  router.get('/admin/archive-options',wrap((req,res)=>{
    requireAdmin(req);res.json({enabled:true,legalEntities:repo.listLegalEntities({includeInactive:true}).map(({id,name})=>({id,name})),capabilities:{view:true,archiveImport:true,attachDocuments:true,purge:true,delete:true,restore:true,create:false,uploadSigned:false},blockers:[]});
  }));
  router.post('/admin/archive-import',upload,wrap(async(req,res)=>{
    requireAdmin(req);
    const input=z.object({clientId:z.string().min(1).max(100).optional(),legalEntityId:z.string().min(1).max(100),number:z.string().trim().min(1).max(100),folder:z.enum(['clients','suppliers','other']).default('clients'),counterparty:z.string().max(6000),signed:z.literal('true'),confirmed:z.literal('true').optional(),idempotencyKey:z.string().min(1).max(100)}).strict().parse(req.body);
    const counterparty=z.object({type:z.enum(['ip','ooo']).optional(),fullName:z.string().trim().min(1).max(2000),inn:z.string().regex(/^\d{10}(\d{2})?$/).optional()}).strict().parse(JSON.parse(input.counterparty));
    if(counterparty.inn!==undefined&&(!validInn(counterparty.inn)||(counterparty.type!==undefined&&(counterparty.type==='ip'?counterparty.inn.length!==12:counterparty.inn.length!==10))))throw documentError('INN_INVALID','Проверьте ИНН и тип контрагента.');
    const clientId=input.clientId?client(req,input.clientId):null;
    if(!repo.listLegalEntities({includeInactive:true}).some(entity=>entity.id===input.legalEntityId))throw documentError('ENTITY_NOT_FOUND','Юрлицо не найдено.',404);
    if(!req.file)throw documentError('DOCUMENT_FILE_REQUIRED','Выберите подписанный договор.');
    const checked=inspectDocumentUpload(req.file.buffer,req.file.originalname,true);
    const previous=repo.findArchivedImport({clientId,entityId:input.legalEntityId,number:input.number,counterparty,actorId:req.user.id,idempotencyKey:input.idempotencyKey,sha256:checked.sha256,folder:input.folder});
    if(previous)return res.status(201).json({document:{...safeDocument(previous),canDelete:true,canRestore:false,canCreate:false,canUploadSigned:false,canAttachDocuments:true}});
    await validateSignedDocument(req.file.buffer,checked.extension,{python:config.fileValidatorPython});
    const file=storage.put(req.file.buffer,checked.extension);
    const document=repo.importArchivedDocument({clientId,folder:input.folder,entityId:input.legalEntityId,number:input.number,counterparty,actorId:req.user.id,idempotencyKey:input.idempotencyKey,
      file:{storageKey:file.key,originalName:req.file.originalname.slice(0,180),mime:checked.extension==='pdf'?'application/pdf':checked.extension==='png'?'image/png':'image/jpeg',size:file.size,sha256:file.sha256}});
    audit(req,'document.archive.import',{documentId:document.id,clientId,signedDeclared:true,source:'archive_upload'});res.status(201).json({document:{...safeDocument(document),canDelete:true,canRestore:false,canCreate:false,canUploadSigned:false,canAttachDocuments:true}});
  }));
  router.post("/admin/sequence", wrap((req, res) => {
    const input = z.object({ nextNumber: z.number().int().positive().safe().default(DEFAULT_CONTRACT_SEQUENCE.nextNumber), prefix: z.string().max(30).default(DEFAULT_CONTRACT_SEQUENCE.prefix), suffix: z.string().max(30).default(DEFAULT_CONTRACT_SEQUENCE.suffix) }).strict().parse(req.body);
    repo.configureSequence(input); audit(req, "document.sequence.configure", {}); res.json({ ok: true });
  }));
  router.post("/admin/legal-entities", wrap((req, res) => {
    const input = z.object({ id: z.string().regex(/^[a-z0-9-]{1,80}$/), name: z.string().min(1).max(200), data: fields, approved: z.literal(true) }).strict().parse(req.body);
    if (validateCounterparty(input.data).errors.length) throw documentError("ENTITY_REQUISITES_INVALID", "Исправьте реквизиты поставщика.");
    const revisionId = repo.saveApprovedLegalEntity({...input,actorId:req.user.id});
    audit(req, "document.legal-entity.approve", { entityId: input.id, revisionId }); res.status(201).json({ revisionId });
  }));
  router.get("/admin/legal-entities", wrap((_req,res) => {
    res.json({legalEntities:repo.listLegalEntities({includeInactive:true}).map(entity=>({
      ...entity,active:Boolean(entity.active),templates:repo.listTemplateVersions(entity.id).map(template=>({
        id:template.id,templateId:template.template_id,paymentType:template.paymentType,
        buyerTypes:template.config.buyerTypes || ["ip","ooo"],supplierTypes:template.config.supplierTypes || ["ip","ooo"],
        approved:true,createdAt:template.created_at,
      }))
    }))});
  }));
  router.post("/admin/legal-entities/:id/activation",wrap(async(req,res)=>{
    const input=z.object({active:z.boolean(),confirmed:z.literal(true)}).strict().parse(req.body);
    const entity=repo.listLegalEntities({includeInactive:true}).find(item=>item.id===req.params.id);
    if(!entity) throw documentError("ENTITY_NOT_FOUND","Юрлицо не найдено.",404);
    if(input.active) {
      if(!entity.approved || validateCounterparty(entity.data).errors.length) throw documentError("ENTITY_REQUISITES_INVALID","Утвердите корректные реквизиты поставщика.");
      for(const payment of ["prepayment","postpayment"]) for(const buyer of ["ip","ooo"]) {
        const template=repo.findTemplateVersion(entity.id,payment,buyer);
        if(!template || (template.config.buyerTypes && !template.config.buyerTypes.includes(buyer)) ||
           (template.config.supplierTypes && !template.config.supplierTypes.includes(entity.data.type))) {
          throw documentError("ENTITY_TEMPLATES_INCOMPLETE","Для активации нужны утверждённые шаблоны предоплаты и постоплаты для покупателей ИП и ООО.");
        }
        if((template.config.requiredSupplierFields || []).some(field=>!entity.data[field]?.trim())) throw documentError("ENTITY_REQUISITES_INVALID","Заполните реквизиты поставщика, необходимые утверждённым шаблонам.");
        await service.previewTemplate(template,{buyerType:buyer,format:"docx"});
      }
    }
    repo.setLegalEntityActive(entity.id,input.active);
    audit(req,"document.legal-entity.activation",{entityId:entity.id,active:input.active});
    res.json({ok:true,active:input.active});
  }));
  router.post("/admin/templates", upload, wrap((req, res) => {
    if (!req.file) throw documentError("TEMPLATE_REQUIRED", "Выберите DOCX-шаблон.");
    const checked = inspectDocumentUpload(req.file.buffer, req.file.originalname);
    if (checked.extension !== "docx") throw documentError("TEMPLATE_DOCX_REQUIRED", "Шаблон должен быть DOCX.");
    const configSchema = z.object({ blocks: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().max(15000)), previousClientTokens: z.array(z.string().min(3).max(200)).max(30),
      buyerTypes: z.array(z.enum(["ip", "ooo"])).min(1).max(2).optional(), supplierTypes: z.array(z.enum(["ip", "ooo"])).min(1).max(2).optional(),
      requiredBuyerFields: z.array(z.enum(counterpartyKeys)).max(counterpartyKeys.length).optional(),
      requiredSupplierFields: z.array(z.enum(counterpartyKeys)).max(counterpartyKeys.length).optional(),
    }).strict();
    const body = z.object({ templateId: z.string().min(1).max(100), entityId: z.string().min(1).max(100), paymentType: z.enum(["prepayment", "postpayment"]), approved: z.literal("true"), config: z.string().max(32768) }).strict().parse(req.body);
    const configValue = configSchema.parse(JSON.parse(body.config));
    const approvedBasis=configValue.blocks.BUYER_AUTHORITY_BASIS;
    if(typeof approvedBasis!=="string" || !approvedBasis.trim() || /\{\{|\}\}|\$\{/.test(approvedBasis)) throw documentError("TEMPLATE_AUTHORITY_BASIS_INVALID","Укажите подтверждённое основание полномочий покупателя из утверждённого шаблона без переменных.");
    const entity=repo.listLegalEntities({includeInactive:true}).find(item=>item.id===body.entityId);
    if(!entity) throw documentError("ENTITY_NOT_FOUND","Сначала добавьте юрлицо.",404);
    if(configValue.supplierTypes && !configValue.supplierTypes.includes(entity.data?.type)) throw documentError("TEMPLATE_SUPPLIER_TYPE_MISMATCH","Шаблон не соответствует типу поставщика.");
    const placeholderValues=Object.fromEntries(["DOCUMENT_NUMBER","DOCUMENT_DATE","DOCUMENT_DATE_RU","PAYMENT_START_EVENT","PAYMENT_DAYS","PAYMENT_DAYS_UNIT","PAYMENT_DAYS_WORDS",
      ...counterpartyKeys.flatMap(key=>["BUYER","SUPPLIER"].map(prefix=>`${prefix}_${key.replace(/[A-Z]/g,letter=>`_${letter}`).toUpperCase()}`))].map(key=>[key,"проверка"]));
    for(const [key,value] of Object.entries(configValue.blocks)) {
      placeholderValues[key]=value.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g,(_match,field)=>{
        if(!Object.hasOwn(placeholderValues,field)) throw documentError("TEMPLATE_CONFIG","Юридический блок содержит неизвестную переменную.");
        return placeholderValues[field];
      });
    }
    const essential=["DOCUMENT_NUMBER","SUPPLIER_FULL_NAME","SUPPLIER_INN","BUYER_FULL_NAME","BUYER_INN"];
    if(essential.some(key=>Object.hasOwn(configValue.blocks,key))) throw documentError("TEMPLATE_CONFIG","Юридические блоки не должны переопределять номер и реквизиты сторон.");
    // Unique sentinels prove placeholders are present even when split across DOCX text runs.
    for(const key of essential) placeholderValues[key]=`CLOVER_REQUIRED_${randomUUID()}_END`;
    placeholderValues.PAYMENT_START_EVENT=body.paymentType==="postpayment"?POSTPAYMENT_START_WORDING:"";
    placeholderValues.PAYMENT_DAYS=body.paymentType==="postpayment"?"7":"";
    const checkedTemplate=renderDocx(req.file.buffer,placeholderValues,{previousClientTokens:configValue.previousClientTokens});
    if(essential.some(key=>!checkedTemplate.text.includes(placeholderValues[key]))) throw documentError("TEMPLATE_VARIABLES_REQUIRED","Нужен подготовленный шаблон с переменными номера договора, наименований и ИНН обеих сторон. Обычный заполненный договор не подходит.");
    const textErrors=validateTemplateText(checkedTemplate.text,{paymentType:body.paymentType,previousClientTokens:configValue.previousClientTokens}).errors;
    if(textErrors.length)throw documentError(textErrors[0].code,textErrors[0].message);
    const file = storage.put(req.file.buffer, "docx");
    const id = repo.publishApprovedTemplate({ templateId: body.templateId, entityId: body.entityId, paymentType: body.paymentType,
      storageKey: file.key, sha256: file.sha256, config: configValue, actorId: req.user.id });
    audit(req, "document.template.approve", { templateVersionId: id }); res.status(201).json({ id });
  }));
  router.post("/admin/templates/:id/preview",wrap(async(req,res)=>{
    const input=z.object({buyerType:z.enum(["ip","ooo"]),format:z.enum(["docx","pdf"])}).strict().parse(req.body);
    const template=repo.getTemplateVersion(req.params.id);
    if(!template)throw documentError("TEMPLATE_NOT_FOUND","Шаблон не найден.",404);
    const buffer=await service.previewTemplate(template,input);
    res.type(input.format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      .set("Content-Disposition",`attachment; filename="contract-sample.${input.format}"`).set("X-Content-Type-Options","nosniff").send(buffer);
    audit(req,"document.template.preview",{templateVersionId:template.id,format:input.format,buyerType:input.buyerType});
  }));
  router.use((error, _req, res, _next) => {
    const badInput = error instanceof z.ZodError || error instanceof SyntaxError;
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : badInput ? 400 : error.status || (error.message === "DOCUMENT_NOT_FOUND" ? 404 : 422);
    res.status(status).json({ code: badInput ? "DOCUMENT_INPUT_INVALID" : error.code || "DOCUMENT_OPERATION_FAILED",
      error: badInput ? "Проверьте введённые данные." : error.code ? error.message : "Не удалось выполнить действие с документом." });
  });
  return router;
}
