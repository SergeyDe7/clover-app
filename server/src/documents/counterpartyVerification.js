import {validInn,validRegistrationNumber} from '../../../src/shared/contracts/requisiteChecks.js';
import {compareRegistryFacts,REGISTRY_REQUISITE_FIELDS} from '../../../src/shared/contracts/externalVerification.js';

const SOURCES=Object.freeze({fns:['https://egrul.nalog.ru','https://service.nalog.ru'],arbitration:['https://kad.arbitr.ru'],fssp:['https://fssp.gov.ru','https://is.fssp.gov.ru']});
const clean=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000&&![...value].some(char=>{const code=char.codePointAt(0);return (code<32&&![9,10,13].includes(code))||code===127||(code>=0xd800&&code<=0xdfff);});
const quoted=(value,evidence)=>evidence.normalize('NFC').trim().replace(/\s+/gu,' ').includes(value.normalize('NFC').trim().replace(/\s+/gu,' '));
const unavailable=(id,code)=>({id,status:'unavailable',code,message:'Источник не подтвердил сведения. Проверка по этому источнику не завершена.',records:[]});
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
  const sources=[];const comparisons=[];
  for(const id of Object.keys(SOURCES)) {
    if(typeof adapters[id]!=='function'){sources.push({id,status:'not_configured',code:'VERIFICATION_NOT_CONFIGURED',message:'Источник не подключён. Сведения по нему не проверены.',records:[]});continue;}
    try {
      const response=await boundedAdapter(adapters[id],Object.freeze({inn:fields.inn,type:fields.type}));
      if(response?.status!=='checked' && !(id==='fns' && response?.status==='partial')){
        const failure=unavailable(id,'VERIFICATION_SOURCE_UNAVAILABLE');
        const fnsFailures={FNS_CAPTCHA_REQUIRED:'ФНС запросила капчу. Автоматическая проверка не завершена; откройте официальный сайт.',FNS_TIMEOUT:'ФНС не ответила вовремя. Проверка не завершена.',FNS_NOT_FOUND:'По точному ИНН сведения не получены. Реквизиты не подтверждены.'};
        if(id==='fns' && Object.hasOwn(fnsFailures,response?.code)){failure.code=response.code;failure.message=fnsFailures[response.code];}
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
        metadata.checkedFields=[...keys];
        if(partial){metadata.status='partial';metadata.missingFields=['legalAddress'];}
        comparisons.push(...compareRegistryFacts(fields,facts,{sourceId:id,sourceUrl:metadata.sourceUrl,checkedAt:metadata.checkedAt,evidence:response.evidence}));
      }else {
        // Judicial/enforcement records are risk information, never requisites.
        if(!Array.isArray(response.records)||response.records.length>100||response.records.some(record=>!clean(record?.id)||!clean(record?.summary)||!clean(record?.evidence)||(record.url!==undefined&&!sourceUrlAllowed(id,record.url)))){sources.push(unavailable(id,'VERIFICATION_RECORD_INVALID'));continue;}
        metadata.records=response.records.map(record=>({id:record.id,summary:record.summary,evidence:record.evidence,...(record.url?{url:record.url}:{})}));
      }
      sources.push(metadata);
    }catch{sources.push(unavailable(id,'VERIFICATION_SOURCE_UNAVAILABLE'));}
  }
  const completed=sources.filter(source=>source.status==='checked'||source.status==='partial').length;
  return {status:sources.every(source=>source.status==='checked')?'checked':completed?'partial':'unavailable',inn:fields.inn,type:fields.type,checkedAt,sources,comparisons,warnings:[{code:'VERIFICATION_LIMITED',message:'Показаны сведения подключённых источников. Результат не подтверждает отсутствие рисков или полномочия подписанта.'}]};
}

export function verifyCounterparty({fields,adapters={},now}={}) {
  return verifyCounterpartySnapshot(fields,{adapters,...(now?{now}:{})});
}
