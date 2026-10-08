import {completeRecognizedFields} from './extraction.js';
import {normalizeRussianPhone} from '../../../src/shared/contracts/russianPhone.js';

export const AI_FIELDS=Object.freeze(['type','fullName','inn','kpp','ogrn','ogrnip','legalAddress','postalAddress','bankName','bik','settlementAccount','correspondentAccount','signerFullName','signerPosition','phone','email','edo']);
const numericFields={inn:[10,12],kpp:[9],ogrn:[13],ogrnip:[15],bik:[9],settlementAccount:[20],correspondentAccount:[20]};
const numericLabels={inn:'ИНН(?:[ \\t]+(?:организации|покупателя))?',kpp:'КПП',ogrn:'ОГРН(?!ИП)',ogrnip:'ОГРНИП',bik:'БИК(?:[ \\t]+банка)?',settlementAccount:'(?:р[ \\t]*[/.][ \\t]*с|расч[её]тный[ \\t]+сч[её]т|номер[ \\t]+(?:расч[её]тного[ \\t]+)?сч[её]та)',correspondentAccount:'(?:к[ \\t]*[/.][ \\t]*с|корр(?:еспондентский)?\\.?[ \\t]*сч[её]т|корсч[её]т)'};
const fold=value=>String(value).normalize('NFC').trim().replace(/\s+/gu,' ');
const error=code=>Object.assign(new Error('Не удалось получить подтверждённые предложения ИИ. Локальные данные сохранены.'),{code});
const safeText=value=>typeof value==='string' && value.trim() && value.length<=2000 && ![...value].some(char=>{const code=char.codePointAt(0);return(code<32&&![9,10,13].includes(code))||code===127||(code>=0xd800&&code<=0xdfff)||code===0xfffe||code===0xffff;});

// Only server response metadata, never fields supplied by the model's JSON.
export function safeAIMetadata(response) {
 const metadata={};
 if(typeof response?.model==='string'&&response.model.length<=100&&/^[A-Za-z0-9._-]+$/u.test(response.model))metadata.model=response.model;
 const usage=response?.usage;
 if(usage&&['input_tokens','output_tokens','total_tokens'].every(key=>Number.isSafeInteger(usage[key])&&usage[key]>=0)&&Number.isSafeInteger(usage.input_tokens+usage.output_tokens)&&usage.total_tokens===usage.input_tokens+usage.output_tokens){
  metadata.usage={input_tokens:usage.input_tokens,output_tokens:usage.output_tokens,total_tokens:usage.total_tokens};
 }
 return metadata;
}

function groundedNumeric(field,value,evidence,text) {
 // Match the label and its immediately following number in the FULL source,
 // not the model's possibly truncated or mixed-field quotation.
 const pattern=new RegExp(`(?<![\\p{L}\\d])${numericLabels[field]}[ \\t]*[:№]?[ \\t\\r\\n]*(\\d(?:[ \\t\\u00a0]*\\d)*)(?![\\p{L}\\d])(?![ \\t\\u00a0]*\\d)`,'giu');
 const matches=[...text.matchAll(pattern)].filter(match=>match[1].replace(/\s/gu,'')===value);
 for(let index=text.indexOf(evidence);index!==-1;index=text.indexOf(evidence,index+1)) {
  if(matches.some(match=>match.index>=index && match.index+match[0].length<=index+evidence.length))return true;
 }
 return false;
}

function groundedLegalType(type,evidence,text) {
 const word=type==='ip'?'(?:ИП|Индивидуальный\\s+предприниматель)':'(?:ООО|Общество\\s+с\\s+ограниченной\\s+ответственностью)';
 // Boundaries are checked against the full source, never a truncated quote.
 const pattern=new RegExp(`(?:^|[\\s(])(${word})(?=[\\s)]|$)`,'giu');
 const spans=[...text.matchAll(pattern)].map(match=>({start:match.index+match[0].length-match[1].length,end:match.index+match[0].length}));
 for(let index=text.indexOf(evidence);index!==-1;index=text.indexOf(evidence,index+1)){
  if(spans.some(span=>span.start>=index&&span.end<=index+evidence.length))return true;
 }
 return false;
}

// Model output is untrusted. Exact source quotes and copied values are mandatory.
export function validateAIProposals(output,text) {
 if(!output || typeof output!=='object' || Array.isArray(output) || Object.keys(output).some(key=>key!=='proposals') || !Array.isArray(output.proposals)||output.proposals.length>100)throw error('AI_RESPONSE_INVALID');
 return output.proposals.map(item=>{
  if(!item || typeof item!=='object'||Object.keys(item).length!==3||!AI_FIELDS.includes(item.field)||!safeText(item.value)||!safeText(item.evidence)||!text.includes(item.evidence))throw error('AI_EVIDENCE_INVALID');
  let value=item.value.trim();
  if(item.field==='type') {
    const ip=groundedLegalType('ip',item.evidence,text);
    const ooo=groundedLegalType('ooo',item.evidence,text);
    if(!['ip','ooo'].includes(value)||ip===ooo||(value==='ip'?!ip:!ooo))throw error('AI_EVIDENCE_INVALID');
  } else if(numericFields[item.field]) {
    if(!/^\d+$/u.test(value)||!numericFields[item.field].includes(value.length)||!groundedNumeric(item.field,value,item.evidence,text))throw error('AI_EVIDENCE_INVALID');
  } else if(!fold(item.evidence).includes(fold(value)))throw error('AI_EVIDENCE_INVALID');
  return {field:item.field,value,evidence:item.evidence};
 });
}

export async function enhanceCardWithAI(localResult,text,provider) {
 const status=provider?.status?.() || {available:false,provider:'disabled',reason:'AI_DISABLED'};
 if(!status.available)return {...localResult,ai:{status:'disabled',provider:status.provider,code:status.reason}};
 try{
  const response=await provider.extract(text);
  if(response.available===false)throw error(response.code || 'AI_DISABLED');
  // Validate again even for injected or future providers.
  const proposals=validateAIProposals({proposals:response.proposals},text);
  const fields={...localResult.fields},warnings=(localResult.warnings || []).map(item=>({...item})),provenance={...(localResult.provenance || {})};
  const groups=new Map();for(const item of proposals){const list=groups.get(item.field)||[];list.push({...item,value:item.field==='phone'?(normalizeRussianPhone(item.value)??item.value):item.value});groups.set(item.field,list);}
  for(const [field,items]of groups){
   const values=[...new Set(items.map(item=>item.value))];const current=fields[field];
   const existingAmbiguity=warnings.find(item=>item.field===field&&item.code==='AMBIGUOUS_REQUISITE');
   // Multiple supplied email contacts are a collection, preserving their roles.
   if(field==='email'&&!existingAmbiguity){
    const lines=[...(typeof current==='string'?current.split(/\r?\n/u):[]),...values.flatMap(value=>value.split(/\r?\n/u))];
    fields[field]=[...new Set(lines.filter(line=>line.trim()).map(line=>line.trim()))].join('\n');
   }else if(existingAmbiguity || values.length>1 || (current && !values.every(value=>fold(value)===fold(field==='phone'?(normalizeRussianPhone(current)??current):current)))){
    const candidates=[...new Set([...(existingAmbiguity?.candidates || []),...(current?[current]:[]),...values])].slice(0,10);
    if(existingAmbiguity){existingAmbiguity.candidates=candidates;}
    else warnings.push({field,code:'AMBIGUOUS_REQUISITE',message:'Локальное распознавание и ИИ предложили разные значения. Выберите по исходной карточке.',candidates});
    provenance[field]={...(provenance[field] || {}),requiresReview:true,aiEvidence:items.map(item=>item.evidence).slice(0,5)};
    continue;
   }else if(!current)fields[field]=values[0];
   if(fields[field]?.length>2000)throw error('AI_RESPONSE_INVALID');
   if(!current || fields[field]!==current){
    provenance[field]={source:'ai_text',snippets:items.map(item=>item.evidence).slice(0,5),requiresReview:true};
    warnings.push({field,code:'AI_SOURCE_REVIEW',source:'ai_text',evidence:items[0].evidence,message:'ИИ предложил значение из текста карточки. Проверьте, что оно относится к этому реквизиту.'});
   }
  }
  return {...completeRecognizedFields({...localResult,fields,warnings,provenance}),ai:{status:'succeeded',provider:status.provider,...safeAIMetadata(response)}};
 }catch(cause){
  const allowed=new Set(['AI_DISABLED','AI_INPUT_LIMIT','AI_TIMEOUT','AI_REFUSED','AI_INCOMPLETE','AI_RESPONSE_LIMIT','AI_RESPONSE_INVALID','AI_EVIDENCE_INVALID','AI_HTTP_FAILED','AI_REQUEST_FAILED','AI_AUTH_FAILED','AI_ACCESS_DENIED','AI_MODEL_UNAVAILABLE','AI_LIMIT_REACHED','AI_QUOTA_EXCEEDED','AI_REQUEST_INVALID','AI_CREDITS_EXHAUSTED','AI_ORG_BUDGET_EXCEEDED','AI_PROJECT_BUDGET_EXCEEDED','AI_ORG_USAGE_EXCEEDED','AI_REGION_UNSUPPORTED']);
  const code=allowed.has(cause?.code)?cause.code:'AI_REQUEST_FAILED';
  const messages={AI_AUTH_FAILED:'Ключ ИИ не прошёл проверку. Администратору нужно проверить настройку ключа.',AI_ACCESS_DENIED:'Сервис ИИ отказал в доступе. Администратору нужно проверить права проекта.',AI_MODEL_UNAVAILABLE:'Настроенная модель ИИ недоступна. Администратору нужно проверить модель и доступ к ней.',AI_LIMIT_REACHED:'Сервис ИИ ограничил запросы. Повторной отправки этой карточки не было.',AI_QUOTA_EXCEEDED:'Сервис ИИ сообщил, что квота API исчерпана. Администратору нужно проверить оплату и лимиты проекта.',AI_REQUEST_INVALID:'Сервис ИИ отклонил параметры запроса. Администратору нужно проверить настройку модуля.'};
  Object.assign(messages,{AI_CREDITS_EXHAUSTED:'Сервис ИИ сообщил, что баланс API исчерпан. Администратору нужно проверить оплату API.',AI_ORG_BUDGET_EXCEEDED:'Сервис ИИ сообщил, что достигнут бюджет организации API.',AI_PROJECT_BUDGET_EXCEEDED:'Сервис ИИ сообщил, что достигнут бюджет проекта API.',AI_ORG_USAGE_EXCEEDED:'Сервис ИИ сообщил, что достигнут лимит использования организации API.',AI_REGION_UNSUPPORTED:'Сервис ИИ сообщил, что регион запроса не поддерживается.'});
  const message=messages[code]?`${messages[code]} Локально распознанные данные сохранены.`:'ИИ не смог дополнить карточку. Локально распознанные данные сохранены.';
  const httpStatus=Number.isInteger(cause?.httpStatus)&&cause.httpStatus>=400&&cause.httpStatus<=599?cause.httpStatus:undefined;
  return {...localResult,warnings:[...(localResult.warnings || []),{code,message}],ai:{status:'fallback',provider:status.provider,code,...(httpStatus?{httpStatus}:{})}};
 }
}
