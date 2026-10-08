import { validInn, validRegistrationNumber } from '../../../src/shared/contracts/requisiteChecks.js';
const ORIGIN='https://egrul.nalog.ru';
const unavailable=code=>({status:'unavailable',code,message:'ФНС не подтвердила сведения. Проверка не завершена.'});
const safeText=value=>typeof value==='string'&&value.trim()&&value.length<=2000&&![...value].some(char=>char.codePointAt(0)<=31||char.codePointAt(0)===127);
function abortError(){return new Error('FNS_ABORTED');}
function callerWait(promise,signal){
  if(!signal)return promise;
  if(signal.aborted)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{const abort=()=>reject(abortError());signal.addEventListener('abort',abort,{once:true});promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});});
}
/** Server-owned adapter: accepts only INN/type; never sends card contents or follows redirects. */
export function createFnsRegistryAdapter({fetchImpl=globalThis.fetch,now=()=>Date.now(),timeoutMs=5000,cacheTtlMs=30000,maxCacheEntries=100,pollDelayMs=150}={}) {
  const cache=new Map(),inflight=new Map();
  async function lookup({inn,type}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.min(5000,Math.max(1,timeoutMs)));let cookie='';
    async function request(path,options={},json=true){
      const response=await callerWait(Promise.resolve().then(()=>fetchImpl(ORIGIN+path,{...options,redirect:'error',signal:controller.signal,headers:{Referer:ORIGIN+'/index.html',...(cookie?{Cookie:cookie}:{}),...options.headers}})),controller.signal);
      if(!response.ok)throw new Error('FNS_HTTP');
      const cookies=response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean);
      if(cookies.length){cookie=cookies.map(value=>value.split(';')[0]).join('; ');if(cookie.length>8192||/[\r\n]/u.test(cookie))throw new Error('FNS_COOKIE');}
      const length=response.headers.get('content-length');if(length&&Number(length)>262144)throw new Error('FNS_SIZE');
      const reader=response.body?.getReader();if(!reader)throw new Error('FNS_BODY');
      const chunks=[];let size=0;
      try{while(true){const part=await callerWait(reader.read(),controller.signal);if(part.done)break;size+=part.value.byteLength;if(size>262144){await reader.cancel();throw new Error('FNS_SIZE');}chunks.push(part.value);}}finally{reader.releaseLock();}
      if(!json)return null;
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('FNS_JSON');return value;
    }
    try{
      await request('/index.html',{},false);
      const search=await request('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({query:inn,region:'',page:'',PreventChromeAutocomplete:''}).toString()});
      if(search.captchaRequired===true)return unavailable('FNS_CAPTCHA_REQUIRED');
      if(search.captchaRequired!==false||typeof search.t!=='string'||!/^[A-Za-z0-9_-]{1,256}$/u.test(search.t))return unavailable('FNS_RESPONSE_INVALID');
      let result;
      for(let attempts=0;attempts<12;attempts++){
        result=await request('/search-result/'+encodeURIComponent(search.t));
        if(result.captchaRequired===true)return unavailable('FNS_CAPTCHA_REQUIRED');
        if(result.status!=='wait')break;
        await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(delay);reject(abortError());};const delay=setTimeout(()=>{controller.signal.removeEventListener('abort',abort);resolve();},pollDelayMs);controller.signal.addEventListener('abort',abort,{once:true});if(controller.signal.aborted)abort();});
      }
      if(result.status==='wait')return unavailable('FNS_TIMEOUT');
      if(!Array.isArray(result.rows)||result.rows.length>100)return unavailable('FNS_RESPONSE_INVALID');
      const registryRows=[];
      for(const item of result.rows) {
        if(!item||typeof item!=='object'||Array.isArray(item))return unavailable('FNS_RESPONSE_INVALID');
        if(['sprav-fl','sprav-ul'].includes(item.k)) {
          const noIdentity=['i','n','o'].every(key=>!Object.hasOwn(item,key));
          const knownMetadata=Object.keys(item).every(key=>['k','cnt','tot','pg','t'].includes(key));
          const zeroTotals=String(item.cnt)==='0'&&String(item.tot)==='0';
          const validPage=item.pg===undefined||/^[1-9]\d*$/u.test(String(item.pg));
          const validToken=item.t===undefined||typeof item.t==='string'&&/^[A-Za-z0-9_-]{1,256}$/u.test(item.t);
          if(!noIdentity||!knownMetadata||!zeroTotals||!validPage||!validToken)return unavailable('FNS_RESPONSE_INVALID');
          continue;
        }
        registryRows.push(item);
      }
      if(registryRows.length===0)return unavailable('FNS_NOT_FOUND');
      // Pagination totals must confirm a unique registry record, not just a unique visible row.
      if(registryRows.length!==1||String(registryRows[0].cnt)!=='1'||String(registryRows[0].tot)!=='1'||String(registryRows[0].pg)!=='1')return {status:'ambiguous',code:'FNS_AMBIGUOUS'};
      const row=registryRows[0];if(row.i!==inn)return unavailable('FNS_IDENTITY_MISMATCH');
      if(!safeText(row.n)||!safeText(row.o))return unavailable('FNS_FACTS_INCOMPLETE');
      const registryType=row.k==='fl'?'ip':row.k==='ul'&&/^ОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ\s+ОТВЕТСТВЕННОСТЬЮ(?:\s|$)/iu.test(row.n)?'ooo':null;
      if(registryType!==type)return unavailable('FNS_TYPE_MISMATCH');
      if(!validRegistrationNumber(row.o,type))return unavailable('FNS_REGISTRATION_INVALID');
      const facts={type,inn,fullName:row.n.trim(),[type==='ip'?'ogrnip':'ogrn']:row.o};
      const evidence={type:JSON.stringify(type==='ip'?{k:row.k}:{k:row.k,n:row.n}),inn:row.i,fullName:row.n,[type==='ip'?'ogrnip':'ogrn']:row.o};
      if(type==='ooo'){if(typeof row.p!=='string'||!/^\d{9}$/u.test(row.p))return unavailable('FNS_FACTS_INCOMPLETE');facts.kpp=row.p;evidence.kpp=row.p;}
      let registryDetails;
      if(typeof row.e==='string'&&/^\d{2}\.\d{2}\.\d{4}$/u.test(row.e)) {
        const [day,month,year]=row.e.split('.');const iso=`${year}-${month}-${day}`;
        const parsed=new Date(`${iso}T00:00:00Z`);
        if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso&&parsed.getTime()<=now())registryDetails={registrationStatus:'terminated',terminationDate:iso,terminationDateEvidence:row.e};
      }
      return {status:type==='ip'?'checked':'partial',identity:{inn,type},facts,evidence,checkedFields:Object.keys(facts),missingFields:type==='ooo'?['legalAddress']:[],...(registryDetails?{registryDetails}:{}),source:{id:'fns',url:ORIGIN+'/index.html',checkedAt:new Date(now()).toISOString()}};
    }catch{return unavailable(controller.signal.aborted?'FNS_TIMEOUT':'FNS_SOURCE_UNAVAILABLE');}finally{clearTimeout(timer);}
  }
  return async function fnsRegistry(input,{signal}={}){
    const {inn,type}=input || {};
    if(!validInn(inn)||!['ip','ooo'].includes(type)||(type==='ip'?inn.length!==12:inn.length!==10))return unavailable('FNS_INPUT_INVALID');
    if(signal?.aborted)throw abortError();
    const key=type+':'+inn;const cached=cache.get(key);if(cached&&cached.expires>now())return structuredClone(cached.value);cache.delete(key);
    let promise=inflight.get(key);
    if(!promise){promise=lookup({inn,type}).then(value=>{if(['checked','partial'].includes(value.status)){cache.set(key,{value,expires:now()+Math.min(60000,Math.max(0,cacheTtlMs))});while(cache.size>Math.max(1,Math.min(100,maxCacheEntries)))cache.delete(cache.keys().next().value);}return value;}).finally(()=>inflight.delete(key));inflight.set(key,promise);}
    return structuredClone(await callerWait(promise,signal));
  };
}

export const createFNSRegistryAdapter=createFnsRegistryAdapter;
