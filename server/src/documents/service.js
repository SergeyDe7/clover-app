import { enforceRequiredFns, validateVerificationChoices } from './verificationPolicy.js';
import { validateCounterparty, validateTemplateText, analyzeCounterparty } from "./validation.js";
import { numberGenitive, paymentDaysUnitGenitive, MAX_POSTPAY_DAYS } from "./russian.js";
import { renderDocx } from "./engine.js";
import { documentError } from "./storage.js";
import { POSTPAYMENT_START_WORDING, fileSafeDocumentNumber } from "./businessRules.js";

const fieldLabels = { type: "тип контрагента", fullName: "полное наименование", inn: "ИНН", kpp: "КПП", ogrn: "ОГРН", ogrnip: "ОГРНИП",
  legalAddress: "юридический адрес", postalAddress: "почтовый адрес", bankName: "банк", bik: "БИК", settlementAccount: "расчётный счёт", correspondentAccount: "корреспондентский счёт",
  signerFullName: "ФИО подписанта", signerFullNameGenitive: "ФИО подписанта в родительном падеже", signerPosition: "должность подписанта", signerPositionGenitive: "должность подписанта в родительном падеже", authorityBasis: "основание полномочий",
  phone: "телефон", accountingPhone: "телефон бухгалтерии", email: "email", edo: "реквизиты ЭДО" };
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export function createDocumentService({ repository: repo, storage, converter, verificationAdapters = {}, fnsVerificationRequired = false }) {
  function validate(payload, { generation = true } = {}) {
    const result = validateCounterparty(payload?.counterparty);
    const errors = [...result.errors];
    const issue = (field, code, message) => errors.push({ field, code, message });
    const entity = repo.listLegalEntities().find((item) => item.id === payload?.legalEntityId);
    if (!entity) issue("legalEntityId", "ENTITY_REQUIRED", "Выберите активное юридическое лицо.");
    const payment = payload?.payment;
    if (!["prepayment", "postpayment"].includes(payment?.type)) issue("payment", "PAYMENT_REQUIRED", "Выберите условия оплаты.");
    if (payment?.type === "postpayment" && (!Number.isInteger(payment.days) || payment.days < 1 || payment.days > MAX_POSTPAY_DAYS)) {
      issue("days", "PAYMENT_DAYS_INVALID", `Укажите целое число дней от 1 до ${MAX_POSTPAY_DAYS} (технический предел).`);
    }
    if (payment?.type === "prepayment" && payment.days != null) issue("days", "UNEXPECTED_DAYS", "Для предоплаты срок постоплаты не используется.");
    if (payload?.confirmed !== true) issue("confirmed", "REVIEW_REQUIRED", "Подтвердите проверку реквизитов и предупреждений.");
    const date = payload?.date;
    const parsed = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) issue("date", "DOCUMENT_DATE_REQUIRED", "Укажите корректную дату договора.");
    let template = null;
    if (entity && payment?.type) template = repo.findTemplateVersion(entity.id, payment.type, payload?.counterparty?.type);
    if (generation) {
      if (!entity?.approved) issue("legalEntityId", "REQUISITES_NOT_APPROVED", "Реквизиты поставщика ещё не утверждены.");
      if (!template) issue("template", "TEMPLATE_NOT_APPROVED", "Утверждённый шаблон для этих условий отсутствует.");
      if (template) {
        const config = template.config || {};
        if (config.buyerTypes && !config.buyerTypes.includes(payload?.counterparty?.type)) issue("counterparty.type", "TEMPLATE_BUYER_TYPE_MISMATCH", "Этот шаблон не утверждён для выбранного типа покупателя.");
        if (config.supplierTypes && !config.supplierTypes.includes(entity?.data?.type)) issue("legalEntityId", "TEMPLATE_SUPPLIER_TYPE_MISMATCH", "Этот шаблон не утверждён для выбранного типа поставщика.");
        const explicitBasis = payload?.counterparty?.authorityBasis;
        const approvedBasis = config.blocks?.BUYER_AUTHORITY_BASIS;
        const hasExplicitBasis = typeof explicitBasis === "string" && Boolean(explicitBasis.trim());
        const hasApprovedBasis = typeof approvedBasis === "string" && Boolean(approvedBasis.trim()) && !/\{\{|\}\}/.test(approvedBasis);
        if (!hasExplicitBasis && !hasApprovedBasis) issue("counterparty.authorityBasis", "AUTHORITY_BASIS_REQUIRED", "Основание полномочий отсутствует в данных покупателя и утверждённом шаблоне.");
        if (approvedBasis !== undefined && !hasApprovedBasis) issue("template", "TEMPLATE_AUTHORITY_BASIS_INVALID", "В утверждённом шаблоне некорректно задано основание полномочий.");
        if (hasExplicitBasis && hasApprovedBasis && explicitBasis.trim() !== approvedBasis.trim()) issue("counterparty.authorityBasis", "AUTHORITY_BASIS_CONFLICT", "Основание полномочий покупателя отличается от утверждённого шаблона.");
        for (const [required, source, prefix, code] of [[config.requiredBuyerFields || [], payload?.counterparty, "counterparty", "TEMPLATE_BUYER_FIELD_REQUIRED"], [config.requiredSupplierFields || [], entity?.data, "legalEntity", "TEMPLATE_SUPPLIER_FIELD_REQUIRED"]]) {
          for (const key of required) {
            if (prefix === "counterparty" && ["phone", "email"].includes(key)) continue;
            if (prefix === "counterparty" && key === "authorityBasis" && hasApprovedBasis) continue;
            if (typeof source?.[key] !== "string" || !source[key].trim()) issue(`${prefix}.${key}`, code, `Для утверждённого шаблона заполните поле «${fieldLabels[key] || "реквизит"}» ${prefix === "counterparty" ? "покупателя" : "поставщика"}.`);
          }
        }
      }
      if (!repo.getSequence()) issue("number", "SEQUENCE_NOT_CONFIGURED", "Администратор должен установить начальный номер договора.");
      if (!converter.available) issue("pdf", "CONVERTER_NOT_CONFIGURED", "Локальный конвертер DOCX → PDF не настроен.");
    }
    const checks=analyzeCounterparty(payload?.counterparty);
    return { valid: errors.length === 0, errors, warnings: checks.warnings, checks, entity, template };
  }

  function reviewForGeneration(document) {
    const payload={legalEntityId:document.entityId,payment:document.payment,counterparty:document.draftData.counterparty,date:document.draftData.date,confirmed:true};
    const revision=repo.getRevision(document.id);
    if(!revision)return validate(payload);
    const snapshot=revision.snapshot;
    const checks=analyzeCounterparty(snapshot.counterparty);
    const errors=[];
    const snapshotPayment={type:snapshot.payment.type,...(snapshot.payment.type==="postpayment"?{days:snapshot.payment.days}:{})};
    if(revision.document_id!==document.id || snapshot.number!==document.number || snapshot.date!==payload.date || canonical(snapshot.counterparty)!==canonical(payload.counterparty) || canonical(snapshotPayment)!==canonical(document.payment)) {
      errors.push({field:"document",code:"DRAFT_SNAPSHOT_MISMATCH",message:"Снимок договора не соответствует подтверждённому черновику."});
    }
    const template=repo.getTemplateVersion(snapshot.template.id);
    if(!template || revision.template_version_id!==template.id || template.entityId!==document.entityId || template.paymentType!==document.payment.type || template.sha256!==snapshot.template.sha256 || canonical(template.config)!==canonical(snapshot.template.config)) {
      errors.push({field:"template",code:"SNAPSHOT_LINK_MISMATCH",message:"Не подтверждена связь сохранённого шаблона со снимком договора."});
    }
    if(!converter.available)errors.push({field:"pdf",code:"CONVERTER_NOT_CONFIGURED",message:"Локальный конвертер DOCX → PDF не настроен."});
    return {valid:errors.length===0,errors,warnings:checks.warnings,checks,entity:{data:snapshot.entity,revisionId:revision.entity_revision_id},template};
  }

  async function createDraft(input) {
    const choices=validateVerificationChoices(input.verification);
    const retry=repo.findDraftRetry?.({...input,verificationChoices:choices});
    if(retry)return retry;
    const payload={legalEntityId:input.entityId,payment:input.payment,counterparty:input.counterparty,date:input.date,confirmed:input.confirmed};
    const validation=validate(payload,{generation:false});
    if(!validation.valid)throw documentError('DOCUMENT_VALIDATION','Исправьте реквизиты черновика.');
    const serverVerification=fnsVerificationRequired?await enforceRequiredFns({fields:input.counterparty,confirmed:input.confirmed,verification:{choices,expectedRegistry:input.verification?.expectedRegistry},adapters:verificationAdapters}):undefined;
    return repo.createDraft({...input,verificationChoices:choices,serverVerification});
  }
  async function generate(id, actorId) {
    const document = repo.getDocument(id);
    if(document.kind==='imported_contract')throw documentError('IMPORTED_DOCUMENT_READ_ONLY','Исторический договор доступен только для просмотра.',409);
    const previousJob = repo.getGenerationJob(id);
    if (previousJob?.state === "succeeded") return { id: previousJob.id, status: previousJob.state, ...(document.draftData.generationVerification?{verification:document.draftData.generationVerification}:{}) };
    if (document.status !== "draft") throw documentError("DOCUMENT_NOT_DRAFT", "Повторная генерация доступна только для черновика.", 409);
    const payload = { legalEntityId: document.entityId, payment: document.payment, counterparty: document.draftData.counterparty, date: document.draftData.date, confirmed: true };
    const frozenRevision = repo.getRevision(id);
    let checked = null;
    if (frozenRevision) {
      // A failed attempt already fixed its template and requisites. New approvals
      // must not change or invalidate that historical revision on retry.
      const snapshot = frozenRevision.snapshot;
      const snapshotPayment = { type: snapshot.payment.type, ...(snapshot.payment.type === "postpayment" ? { days: snapshot.payment.days } : {}) };
      if (snapshot.number !== document.number || snapshot.date !== payload.date || canonical(snapshot.counterparty) !== canonical(payload.counterparty) || canonical(snapshotPayment) !== canonical(document.payment)) {
        throw documentError("DRAFT_SNAPSHOT_MISMATCH", "Снимок договора не соответствует подтверждённому черновику.", 409);
      }
      if (!converter.available) throw documentError("CONVERTER_NOT_CONFIGURED", "Локальный конвертер DOCX → PDF не настроен.");
    } else {
      checked = validate(payload);
      if (!checked.valid) throw documentError("DOCUMENT_VALIDATION", checked.errors.map((item) => item.message).join(" "));
    }
    let generationVerification;
    if(fnsVerificationRequired) {
      const report=await enforceRequiredFns({fields:payload.counterparty,confirmed:true,storedVerification:document.draftData.verification,adapters:verificationAdapters});
      repo.saveDraftGenerationVerification(id,report); generationVerification=report;
    }
    // Lock persists across worker instances. A successful retry returns the same result.
    const job = repo.claimGenerationJob(id);
    if (!job.claimed) return { id: job.id, status: job.state, ...(generationVerification?{verification:generationVerification}:{}) };
    try {
      repo.reserveNumber(id);
      const previous = repo.getRevision(id);
      const revision = previous || repo.createRevision({ documentId: id, entityRevisionId: checked.entity.revisionId,
        counterpartySnapshotId: repo.saveCounterparty({ clientId: document.clientId, data: payload.counterparty, actorId }),
        templateVersionId: checked.template.id, actorId, date: payload.date });
      const snapshot = revision.snapshot;
      const template = repo.getTemplateVersion(snapshot.template.id);
      const values = { DOCUMENT_NUMBER: snapshot.number, DOCUMENT_DATE: snapshot.date,
        DOCUMENT_DATE_RU: `${snapshot.date.slice(8, 10)}.${snapshot.date.slice(5, 7)}.${snapshot.date.slice(0, 4)}`,
        PAYMENT_START_EVENT: snapshot.payment.type === "postpayment" ? POSTPAYMENT_START_WORDING : "",
        PAYMENT_DAYS: snapshot.payment.type === "postpayment" ? String(snapshot.payment.days) : "",
        PAYMENT_DAYS_UNIT: snapshot.payment.type === "postpayment" ? paymentDaysUnitGenitive(snapshot.payment.days) : "",
        PAYMENT_DAYS_WORDS: snapshot.payment.type === "postpayment" ? numberGenitive(snapshot.payment.days) : "" };
      for (const [prefix, fields] of [["SUPPLIER", snapshot.entity], ["BUYER", snapshot.counterparty]]) {
        for (const [key, value] of Object.entries(fields)) {
          if (typeof value === "string") values[`${prefix}_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`] = value;
        }
      }
      values.BUYER_PHONE = snapshot.counterparty.phone?.trim() || "";
      values.BUYER_EMAIL = snapshot.counterparty.email?.trim() || "";
      // Optional contact requisite; an absent value emits no label or invented operator.
      values.BUYER_EDO = snapshot.counterparty.edo?.trim() ? `\nЭДО: ${snapshot.counterparty.edo.trim()}` : "";
      // These are approved, versioned blocks. No legal text is synthesized here.
      for (const [key, value] of Object.entries(template.config.blocks || {})) {
        if (typeof value !== "string") throw documentError("TEMPLATE_CONFIG", "Некорректный юридический блок.");
        values[key] = value.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_match, field) => {
          if (!Object.hasOwn(values, field)) throw documentError("TEMPLATE_CONFIG", `Нет данных для ${field}.`);
          return values[field];
        });
      }
      const rendered = renderDocx(storage.read(template.storageKey, template.sha256), values, { previousClientTokens: template.config.previousClientTokens || [] });
      const textCheck = validateTemplateText(rendered.text, { paymentType: snapshot.payment.type, previousClientTokens: template.config.previousClientTokens || [] });
      if (textCheck.errors.length) throw documentError("DOCUMENT_TEXT_INVALID", textCheck.errors.map((item) => item.message).join(" "));
      const pdf = await converter.convert(rendered.buffer);
      // Store only after both outputs exist. Never publish a half-generated pair.
      const files = [];
      for (const [type, buffer, mime] of [["docx", rendered.buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ["pdf", pdf, "application/pdf"]]) {
        const file = storage.put(buffer, type);
        files.push({ purpose: type, storageKey: file.key,
          originalName: `Договор_${fileSafeDocumentNumber(snapshot.number)}.${type}`, mime, size: file.size, sha256: file.sha256, actorId });
      }
      repo.finalizeGeneration({ jobId: job.id, leaseToken: job.lease_token, documentId: id, revisionId: revision.id, files });
      return { id: job.id, status: "succeeded", ...(generationVerification?{verification:generationVerification}:{}) };
    } catch (error) {
      repo.failGeneration({ jobId: job.id, leaseToken: job.lease_token, errorCode: error.code || "GENERATION_FAILED" });
      throw error;
    }
  }
  async function previewTemplate(template,{buyerType,format}) {
    if(!template || !["ip","ooo"].includes(buyerType) || !["docx","pdf"].includes(format)) throw documentError("TEMPLATE_PREVIEW_INVALID","Проверьте вариант образца.");
    const entity=repo.listLegalEntities({includeInactive:true}).find(item=>item.id===template.entityId);
    if(!entity?.approved) throw documentError("ENTITY_REQUISITES_INVALID","Утвердите реквизиты поставщика.");
    const approvedBasis=template.config.blocks?.BUYER_AUTHORITY_BASIS;
    if(typeof approvedBasis!=="string" || !approvedBasis.trim() || /\{\{|\}\}|\$\{/.test(approvedBasis)) throw documentError("TEMPLATE_AUTHORITY_BASIS_INVALID","Укажите подтверждённое основание полномочий покупателя из утверждённого шаблона без переменных.");
    if(template.config.buyerTypes && !template.config.buyerTypes.includes(buyerType)) throw documentError("TEMPLATE_BUYER_TYPE_MISMATCH","Этот шаблон не подходит выбранному типу покупателя.");
    if(template.config.supplierTypes && !template.config.supplierTypes.includes(entity.data.type)) throw documentError("TEMPLATE_SUPPLIER_TYPE_MISMATCH","Этот шаблон не подходит выбранному поставщику.");
    if((template.config.requiredSupplierFields || []).some(field=>!entity.data[field]?.trim()))throw documentError("ENTITY_REQUISITES_INVALID","Заполните реквизиты поставщика, необходимые шаблону.");
    const values={DOCUMENT_NUMBER:"ОБРАЗЕЦ",DOCUMENT_DATE:"2000-01-01",DOCUMENT_DATE_RU:"01.01.2000",
      PAYMENT_START_EVENT:template.paymentType==="postpayment"?POSTPAYMENT_START_WORDING:"",
      PAYMENT_DAYS:template.paymentType==="postpayment"?"7":"",PAYMENT_DAYS_WORDS:template.paymentType==="postpayment"?numberGenitive(7):"",
      PAYMENT_DAYS_UNIT:template.paymentType==="postpayment"?paymentDaysUnitGenitive(7):""};
    const buyer={type:buyerType,fullName:buyerType==="ip"?"ИП Проверочный образец":"ООО «Проверочный образец»",
      inn:buyerType==="ip"?"123456789047":"1234567894",kpp:buyerType==="ooo"?"123456789":"",ogrn:buyerType==="ooo"?"1123456789012":"",ogrnip:buyerType==="ip"?"312345678901230":"",
      legalAddress:"г. Пример, ул. Тестовая, д. 1",postalAddress:"г. Пример, ул. Тестовая, д. 1",bankName:"Тестовый банк",bik:"123456789",settlementAccount:"1".repeat(20),correspondentAccount:"2".repeat(20),
      signerFullName:"Иванов Иван Иванович",signerFullNameGenitive:"Иванова Ивана Ивановича",signerPosition:buyerType==="ip"?"Индивидуальный предприниматель":"Генеральный директор",signerPositionGenitive:buyerType==="ip"?"Индивидуального предпринимателя":"Генерального директора",
      authorityBasis:"",phone:"+7 (977) 777-77-77",accountingPhone:"",email:"example@example.invalid",edo:"Тестовый оператор, идентификатор ОБРАЗЕЦ"};
    for(const [prefix,data] of [["BUYER",buyer],["SUPPLIER",entity.data]]) for(const key of ["type",...Object.keys(fieldLabels)]) {
      values[`${prefix}_${key.replace(/[A-Z]/g,letter=>`_${letter}`).toUpperCase()}`]=data[key] || "";
    }
    values.BUYER_EDO=`\nЭДО: ${buyer.edo}`;
    for(const [key,value] of Object.entries(template.config.blocks || {})) values[key]=value.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g,(_match,field)=>{
      if(!Object.hasOwn(values,field)) throw documentError("TEMPLATE_CONFIG","Неизвестная переменная блока.");return values[field];
    });
    const rendered=renderDocx(storage.read(template.storageKey,template.sha256),values,{previousClientTokens:template.config.previousClientTokens || []});
    const textErrors=validateTemplateText(rendered.text,{paymentType:template.paymentType,previousClientTokens:template.config.previousClientTokens || []}).errors;
    if(textErrors.length)throw documentError(textErrors[0].code,textErrors[0].message);
    if(format==="docx")return rendered.buffer;
    if(!converter?.available)throw documentError("DOCUMENT_CONVERTER_UNAVAILABLE","Локальный конвертер DOCX → PDF не настроен.",503);
    return converter.convert(rendered.buffer);
  }
  return { validate, createDraft, generate, previewTemplate, reviewForGeneration };
}
