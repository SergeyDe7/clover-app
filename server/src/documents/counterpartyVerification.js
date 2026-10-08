import {validInn,validRegistrationNumber} from '../../../src/shared/contracts/requisiteChecks.js';
import {compareRegistryFacts,REGISTRY_REQUISITE_FIELDS} from '../../../src/shared/contracts/externalVerification.js';

const SOURCES=Object.freeze({fns:['https://egrul.nalog.ru','https://service.nalog.ru'],arbitration:['https://kad.arbitr.ru'],fssp:['https://fssp.gov.ru','https://is.fssp.gov.ru'],bankruptcy:['https://bankrot.fedresurs.ru']});
const clean=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000&&![...value].some(char=>{const code=char.codePointAt(0);return (code<32&&![9,10,13].includes(code))||code===127||(code>=0xd800&&code<=0xdfff);});
const quoted=(value,evidence)=>evidence.normalize('NFC').trim().replace(/\s+/gu,' ').includes(value.normalize('NFC').trim().replace(/\s+/gu,' '));
const unavailable=(id,code)=>({id,status:'unavailable',code,message:'Источник не подтвердил сведения. Проверка по этому источнику не завершена.',records:[]});
function validBankruptcyRecords(records,fields) {
  const ids=new Set();
  return records.every(record=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id)||ids.has(record.id.toLowerCase()))return false;
    ids.add(record.id.toLowerCase());
    try {
      const evidence=JSON.parse(record.evidence);
      const name=evidence?.[fields.type==='ip'?'fio':'name'];
      return evidence&&typeof evidence==='object'&&!Array.isArray(evidence)&&evidence.inn===fields.inn&&evidence.guid===record.id&&clean(name)&&quoted(name,record.summary);
    }catch{return false;}
  });
}
function sourceUrlAllowed(id,value) {
  try {const url=new URL(value);return SOURCES[id].includes(url.origin)&&url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
function validTypeEvidence(facts,evidence) {
  if(quoted(facts.type,evidence)) return true;
  try {
    const row=JSON.parse(evidence);
    return facts.type==='ip'?row.k==='fl':row.k==='ul' && row.n===facts.fullName && /^ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ(?:\s|$)/u.test(row.n);
  }catch{return false;}
}
function verifiedTermination(details,timestamp) {
  if(!details||typeof details!=='object'||Array.isArray(details)||
    details.registrationStatus!=='terminated'||typeof details.terminationDate!=='string'||
    !/^\d{4}-\d{2}-\d{2}$/u.test(details.terminationDate)||typeof details.terminationDateEvidence!=='string'||
    !/^\d{2}\.\d{2}\.\d{4}$/u.test(details.terminationDateEvidence))return null;
  const [day,month,year]=details.terminationDateEvidence.split('.');
  if(`${year}-${month}-${day}`!==details.terminationDate)return null;
  const date=new Date(`${details.terminationDate}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==details.terminationDate||date.getTime()>timestamp)return null;
  return {registrationStatus:'terminated',terminationDate:details.terminationDate,terminationDateEvidence:details.terminationDateEvidence};
}
async function boundedAdapter(adapter,input) {
  const controller=new AbortController();let timer;
  try {
    return await Promise.race([Promise.resolve().then(()=>adapter(input,{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('VERIFICATION_TIMEOUT'));},5000);})]);
  }finally {clearTimeout(timer);controller.abort();}
}

// Adapters are injected by the server only. This module performs no network,
// accepts no caller URLs/credentials and stores no records in the application DB.
export async function verifyCounterpartySnapshot(snapshot,{adapters={},now=()=>Date.now(),maxAgeMs=86400000}={}) {
  const fields=Object.fromEntries(REGISTRY_REQUISITE_FIELDS.filter(field=>typeof snapshot?.[field]==='string').map(field=>[field,snapshot[field].normalize('NFC').trim()]));
  const timestamp=now();const checkedAt=new Date(timestamp).toISOString();
  if(!validInn(fields.inn)||!['ip','ooo'].includes(fields.type)||(fields.type==='ip'?fields.inn.length!==12:fields.inn.length!==10))return {status:'invalid',inn:fields.inn || '',type:fields.type || '',checkedAt,sources:[],comparisons:[],warnings:[{code:'INN_INVALID',message:'Укажите корректные ИНН и тип контрагента.'}]};
  const sources=[];const comparisons=[];const warnings=[];
  for(const id of Object.keys(SOURCES)) {
    if(typeof adapters[id]!=='function'){sources.push({id,status:'not_configured',code:'VERIFICATION_NOT_CONFIGURED',message:'Источник не подключён. Сведения по нему не проверены.',records:[]});continue;}
    try {
      const response=await boundedAdapter(adapters[id],Object.freeze({inn:fields.inn,type:fields.type}));
      if(response?.status!=='checked' && !(id==='fns' && response?.status==='partial')){
        const failure=unavailable(id,'VERIFICATION_SOURCE_UNAVAILABLE');
        const fnsFailures={FNS_CAPTCHA_REQUIRED:'ФНС запросила капчу. Автоматическая проверка не завершена; откройте официальный сайт.',FNS_TIMEOUT:'ФНС не ответила вовремя. Проверка не завершена.',FNS_NOT_FOUND:'По точному ИНН сведения не получены. Реквизиты не подтверждены.'};
        if(id==='fns' && Object.hasOwn(fnsFailures,response?.code)){failure.code=response.code;failure.message=fnsFailures[response.code];}
        const bankruptcyFailures={PUBLIC_BANKRUPTCY_BLOCKED:'Открытый источник банкротства ограничил автоматический доступ. Проверка не завершена.',PUBLIC_BANKRUPTCY_TIMEOUT:'Открытый источник банкротства не ответил вовремя. Проверка не завершена.',PUBLIC_BANKRUPTCY_INVALID:'Открытый источник банкротства вернул непроверяемый ответ. Проверка не завершена.'};
        if(id==='bankruptcy'&&Object.hasOwn(bankruptcyFailures,response?.code)){failure.code=response.code;failure.message=bankruptcyFailures[response.code];}
        sources.push(response?.status==='ambiguous'?{id,status:'ambiguous',code:'VERIFICATION_AMBIGUOUS',message:'Источник вернул неоднозначное совпадение. Требуется уточнение.',records:[]}:failure);continue;
      }
      const time=Date.parse(response.source?.checkedAt);
      if(response.source?.id!==id||!sourceUrlAllowed(id,response.source?.url)||!Number.isFinite(time)||time>timestamp+60000||timestamp-time>maxAgeMs||response.identity?.inn!==fields.inn||response.identity?.type!==fields.type){sources.push(unavailable(id,'VERIFICATION_EVIDENCE_INVALID'));continue;}
      const metadata={id,status:'checked',sourceUrl:response.source.url,checkedAt:response.source.checkedAt,records:[]};
      if(id==='fns') {
        const facts=response.facts;
        const keys=facts&&typeof facts==='object'&&!Array.isArray(facts)?Object.keys(facts):[];
        const partial=response.status==='partial';
        const required=fields.type==='ip'?['type','inn','fullName','ogrnip']:['type','inn','fullName','ogrn','kpp',...(partial?[]:['legalAddress'])];
        if(partial && (fields.type!=='ooo' || JSON.stringify(response.missingFields)!==JSON.stringify(['legalAddress']) || 'legalAddress' in (facts || {}) || !Array.isArray(response.checkedFields) || response.checkedFields.length!==keys.length || new Set(response.checkedFields).size!==keys.length || response.checkedFields.some(field=>!keys.includes(field)))) {sources.push(unavailable(id,'VERIFICATION_FACTS_INCOMPLETE'));continue;}
        if(required.some(field=>!clean(facts?.[field]))) {sources.push(unavailable(id,'VERIFICATION_FACTS_INCOMPLETE'));continue;}
        // One invalid fact invalidates this source result; no partial green result.
        const invalid=!keys.length||keys.some(field=>!REGISTRY_REQUISITE_FIELDS.includes(field)||!clean(facts[field])||!clean(response.evidence?.[field])||!(field==='type'?validTypeEvidence(facts,response.evidence[field]):quoted(facts[field],response.evidence[field])))||
          facts.inn!==fields.inn||facts.type!==fields.type||
          (fields.type==='ip'&&('legalAddress' in facts||'kpp' in facts||'ogrn' in facts))||
          (fields.type==='ooo'&&'ogrnip' in facts)||
          (facts.kpp!==undefined&&!/^\d{9}$/u.test(facts.kpp))||
          (facts.ogrn!==undefined&&!validRegistrationNumber(facts.ogrn,'ooo'))||
          (facts.ogrnip!==undefined&&!validRegistrationNumber(facts.ogrnip,'ip'));
        if(invalid){sources.push(unavailable(id,'VERIFICATION_FACT_INVALID'));continue;}
        // Optional risk warning only after every returned FNS core fact/evidence passes.
        const termination=verifiedTermination(response.registryDetails,timestamp);
        if(termination) {
          metadata.registryDetails=termination;
          warnings.push({code:'FNS_REGISTRATION_TERMINATED',message:`По сведениям ФНС регистрация контрагента прекращена ${termination.terminationDateEvidence}. Проверьте сведения перед заключением договора.`,sourceId:id,terminationDate:termination.terminationDate,evidence:termination.terminationDateEvidence});
        }
        metadata.checkedFields=[...keys];
        if(partial){metadata.status='partial';metadata.missingFields=['legalAddress'];}
        comparisons.push(...compareRegistryFacts(fields,facts,{sourceId:id,sourceUrl:metadata.sourceUrl,checkedAt:metadata.checkedAt,evidence:response.evidence}));
      }else {
        // Judicial/enforcement records are risk information, never requisites.
        if(!Array.isArray(response.records)||response.records.length>100||response.records.some(record=>!clean(record?.id)||!clean(record?.summary)||!clean(record?.evidence)||(record.url!==undefined&&!sourceUrlAllowed(id,record.url)))){sources.push(unavailable(id,'VERIFICATION_RECORD_INVALID'));continue;}
        if(id==='bankruptcy') {
          if(!Number.isSafeInteger(response.total)||response.total<response.records.length||(response.total===0)!==(response.records.length===0)||response.records.length>15||!validBankruptcyRecords(response.records,fields)){sources.push(unavailable(id,'VERIFICATION_RECORD_INVALID'));continue;}
          metadata.total=response.total;metadata.returnedCount=response.records.length;metadata.recordsTruncated=response.total>response.records.length;
          if(metadata.recordsTruncated)warnings.push({code:'BANKRUPTCY_RECORDS_TRUNCATED',message:`Источник банкротства показывает записей: ${response.total}; получено: ${response.records.length}. Просмотрите полный результат на официальном сайте.`,sourceId:id});
        }
        metadata.records=response.records.map(record=>({id:record.id,summary:record.summary,evidence:record.evidence,...(record.url?{url:record.url}:{})}));
      }
      sources.push(metadata);
    }catch{sources.push(unavailable(id,'VERIFICATION_SOURCE_UNAVAILABLE'));}
  }
  const completed=sources.filter(source=>source.status==='checked'||source.status==='partial').length;
  return {status:sources.every(source=>source.status==='checked')?'checked':completed?'partial':'unavailable',inn:fields.inn,type:fields.type,checkedAt,sources,comparisons,warnings:[...warnings,{code:'VERIFICATION_LIMITED',message:'Показаны сведения подключённых источников. Результат не подтверждает отсутствие рисков или полномочия подписанта.'}]};
}

export function verifyCounterparty({fields,adapters={},now}={}) {
  return verifyCounterpartySnapshot(fields,{adapters,...(now?{now}:{})});
}
