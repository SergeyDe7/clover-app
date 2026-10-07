// Explicit local integration check. Uses only a fresh in-memory database.
// Inputs are private candidates; customer cards never leave this computer.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import express from "express";
import { applyDocumentsSchema } from "../src/documents/schema.js";
import { createDocumentsRepository } from "../src/documents/repository.js";
import { createDocumentStorage } from "../src/documents/storage.js";
import { createDocumentService } from "../src/documents/service.js";
import { createDocumentsRouter } from "../src/documents/router.js";
import { createDocumentConverter } from "../src/documents/engine.js";
import { docxText } from "../src/documents/extraction.js";

const execute = promisify(execFile);
const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) argumentsMap.set(process.argv[index],process.argv[index + 1]);
if (argumentsMap.has("--help")) {
  console.log("node server/scripts/verify-documents-local-runtime.mjs --converter <absolute-soffice-path> --python <absolute-python-with-pypdf> --templates-root <private-final-candidates-root> [--date YYYY-MM-DD]");
  process.exit(0);
}
for (const key of ["--converter","--python","--templates-root"]) assert(argumentsMap.get(key) && path.isAbsolute(argumentsMap.get(key)),`${key}: explicit absolute path required`);
const date = argumentsMap.get("--date") || "2026-10-05";
assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) === date,"valid ISO --date required");
const candidatesRoot = argumentsMap.get("--templates-root");
const outputParent = path.resolve(".tmp");
await mkdir(outputParent,{recursive:true});
const outputRoot = await mkdtemp(path.join(outputParent,"local-runtime-check-"));
const storage = createDocumentStorage(path.join(outputRoot,"private-storage"));
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL) STRICT");
const actors = { admin:{id:"runtime-admin",role:"admin"}, client:{id:"runtime-client",role:"client"}, other:{id:"runtime-other",role:"client"} };
for (const actor of Object.values(actors)) db.prepare("INSERT INTO users VALUES(?,?)").run(actor.id,actor.role);
applyDocumentsSchema(db);
const repository = createDocumentsRepository(db);
const candidates = [];
for (const supplier of ["ip","ooo"]) for (const paymentType of ["prepayment","postpayment"]) for (const buyer of ["ip","ooo"]) {
  const variant = `${supplier}-${buyer}-${paymentType}`;
  const directory = path.join(candidatesRoot,variant);
  const manifest = JSON.parse(await readFile(path.join(directory,"manifest.private.json"),"utf8"));
  const synthetic = JSON.parse(await readFile(path.join(directory,"synthetic-values.private.json"),"utf8"));
  const names = (await readdir(directory)).filter(name => name.endsWith(".template.docx"));
  assert.equal(names.length,1,`${variant}: exactly one finalized template required`);
  const buffer = await readFile(path.join(directory,names[0]));
  assert.equal(createHash("sha256").update(buffer).digest("hex"),manifest.templateSha256,`${variant}: template hash mismatch`);
  const entityId = `supplier-${supplier}`;
  if (!repository.listLegalEntities().some(entity => entity.id === entityId)) {
    repository.createLegalEntity({id:entityId,name:`Local ${supplier}`});
    repository.createLegalEntityRevision({entityId,data:synthetic.supplier,actorId:actors.admin.id});
  }
  assert.equal(synthetic.buyer.type,buyer,`${variant}: buyer fixture type mismatch`);
  assert.equal(synthetic.supplier.type,supplier,`${variant}: supplier fixture type mismatch`);
  const file = storage.put(buffer,"docx");
  const templateId = repository.createTemplateVersion({templateId:variant,entityId,paymentType,storageKey:file.key,sha256:file.sha256,config:manifest.config,actorId:actors.admin.id});
  candidates.push({variant,supplier,buyer,paymentType,entityId,templateId,synthetic});
}
repository.configureSequence({nextNumber:255,prefix:"1-636/",suffix:""});
const realConverter = createDocumentConverter({executable:argumentsMap.get("--converter"),tempRoot:path.join(outputRoot,"conversion-temp")});
let conversions = 0;
const converter = {available:realConverter.available,async convert(buffer) { conversions++; return realConverter.convert(buffer); }};
const service = createDocumentService({repository,storage,converter});
const app = express();
app.use(express.json({limit:"256kb"}));
const authRequired = (req,res,next) => {req.user=actors[req.headers["x-test-actor"]]; if (!req.user) return res.status(401).end(); next();};
app.use("/api/documents",createDocumentsRouter({enabled:true,repository,storage,service,authRequired,findUser:id => Object.values(actors).find(actor => actor.id === id)}));
const server = await new Promise(resolve => {const instance = app.listen(0,"127.0.0.1",() => resolve(instance));});
const base = `http://127.0.0.1:${server.address().port}/api/documents`;
const request = (url,actor="admin",body) => fetch(base+url,{method:body?"POST":"GET",headers:{"x-test-actor":actor,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
const normalize = text => text.normalize("NFC").replace(/[\s\u00ad]+/gu,"");
const report = {database:"in-memory-only",converter:"local",externalServices:false,variants:[]};
try {
  assert.equal((await request(`/clients/${actors.client.id}`,"other")).status,403);
  for (const item of candidates) {
    const payload = {legalEntityId:item.entityId,date,payment:item.paymentType === "prepayment"?{type:"prepayment",days:null}:{type:"postpayment",days:21},
      counterparty:item.synthetic.buyer,confirmed:true,idempotencyKey:`runtime-${item.variant}`};
    const check = await request(`/clients/${actors.client.id}/validate`,"admin",payload);
    const validation = await check.json();
    assert(validation.valid,`${item.variant}: validation blocked (${validation.errors?.map(error => error.code).join(",")})`);
    const created = await request(`/clients/${actors.client.id}/drafts`,"admin",payload);
    assert.equal(created.status,201,`${item.variant}: draft failed`);
    const {document} = await created.json();
    assert.equal((await request(`/${document.id}/generate`,"other",{})).status,403);
    const generated = await request(`/${document.id}/generate`,"admin",{});
    assert.equal(generated.status,200,`${item.variant}: local generation failed (${(await generated.clone().json()).code || "unknown"})`);
    const job = await generated.json();
    const retry = await request(`/${document.id}/generate`,"admin",{});
    assert.deepEqual(await retry.json(),job,`${item.variant}: retry changed job`);
    const revision = repository.getRevision(document.id);
    assert.equal(revision.snapshot.template.id,item.templateId,`${item.variant}: wrong template selected`);
    const files = repository.getDocument(document.id).files;
    assert.equal(files.length,2,`${item.variant}: incomplete file pair`);
    const artifactDirectory = path.join(outputRoot,item.variant);
    await mkdir(artifactDirectory);
    let sourceText;
    let pdfPath;
    for (const file of files) {
      assert.equal((await request(`/${document.id}/files/${file.id}`,"other")).status,403);
      const download = await request(`/${document.id}/files/${file.id}`,"client");
      assert.equal(download.status,200);
      assert.equal(download.headers.get("cache-control"),"no-store");
      const buffer = Buffer.from(await download.arrayBuffer());
      assert.equal(createHash("sha256").update(buffer).digest("hex"),file.sha256,`${item.variant}: output hash mismatch`);
      const filePath = path.join(artifactDirectory,`contract.${file.type}`);
      await writeFile(filePath,buffer);
      if (file.type === "docx") sourceText = docxText(buffer);
      else { assert.equal(buffer.subarray(0,5).toString(),"%PDF-"); pdfPath = filePath; }
    }
    const python = "import sys,json; from pypdf import PdfReader; d=PdfReader(sys.argv[1]); print(json.dumps({'pages':len(d.pages),'text':'\\n'.join(p.extract_text() or '' for p in d.pages)},ensure_ascii=True))";
    const {stdout} = await execute(argumentsMap.get("--python"),["-c",python,pdfPath],{shell:false,timeout:30000,maxBuffer:2*1024*1024,windowsHide:true,encoding:"utf8"});
    const pdf = JSON.parse(stdout);
    assert(pdf.pages > 0,`${item.variant}: PDF has no pages`);
    const expected = [revision.snapshot.number,`${date.slice(8)}.${date.slice(5,7)}.${date.slice(0,4)}`];
    for (const data of [revision.snapshot.entity,revision.snapshot.counterparty]) for (const key of ["fullName","inn","bik","settlementAccount","correspondentAccount","phone","email","edo"]) if (data[key]) expected.push(data[key]);
    const authority = repository.getTemplateVersion(revision.snapshot.template.id)?.config?.blocks?.BUYER_AUTHORITY_BASIS;
    if (authority) expected.push(authority);
    for (const value of expected) {
      assert(normalize(sourceText).includes(normalize(value)),`${item.variant}: snapshot value missing in DOCX`);
      assert(normalize(pdf.text).includes(normalize(value)),`${item.variant}: DOCX/PDF data mismatch`);
    }
    assert(!/\{\{[A-Z][A-Z0-9_]*\}\}/.test(sourceText),`${item.variant}: unresolved placeholders`);
    report.variants.push({variant:item.variant,status:"passed",pages:pdf.pages,number:revision.snapshot.number,templateSha256:revision.snapshot.template.sha256});
    console.log(`PASS ${item.variant}: real DOCX/PDF, ${pdf.pages} pages, same data, authorized download, idempotent retry`);
  }
  assert.equal(conversions,8,"retry must not repeat conversion");
  assert.equal(repository.getSequence().next_number,263);
  report.status="passed";
  await writeFile(path.join(outputRoot,"report.json"),JSON.stringify(report,null,2));
  console.log(`PASS all 8 variants; evidence: ${outputRoot}`);
} finally {
  await new Promise(resolve => server.close(resolve));
  db.close();
}
