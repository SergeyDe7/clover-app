import {validInn} from '../../../src/shared/contracts/requisiteChecks.js';
const ORIGIN='https://bankrot.fedresurs.ru';
const LIMIT=262144;
const failure=code=>({status:'unavailable',code:'PUBLIC_BANKRUPTCY_'+code,records:[]});
const text=value=>typeof value==='string'&&value.trim()&&value.length<=1200&&!/[\x00-\x1f\x7f]/u.test(value);
// Public website search. Caller URLs and credentials are never accepted.
export function createPublicBankruptcyAdapter({fetchImpl=globalThis.fetch,now=()=>Date.now(),timeoutMs=5000}={}) {
 return async function publicBankruptcy({inn,type}={}, {signal}={}) {
  if(typeof inn!=='string'||!validInn(inn)||!['ip','ooo'].includes(type)||inn.length!==(type==='ip'?12:10))return failure('INVALID');
  const controller=new AbortController();let timer;let timedOut=false;let reader;
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){signal.removeEventListener('abort',abort);return failure('BLOCKED');}
  const url=new URL('/backend/'+(type==='ip'?'prsnbankrupts':'cmpbankrupts'),ORIGIN);
  url.search=new URLSearchParams({searchString:inn,limit:'15',offset:'0'}).toString();
  try {
   const work=async()=>{
    const response=await fetchImpl(url.href,{method:'GET',redirect:'error',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
    if(controller.signal.aborted)return failure(timedOut?'TIMEOUT':'BLOCKED');
    if(!response.ok)return failure('BLOCKED');
    if(!/^application\/json(?:\s*;|$)/iu.test(response.headers.get('content-type')||''))return failure('INVALID');
    const declared=response.headers.get('content-length');
    if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>LIMIT))return failure('INVALID');
    if(!response.body?.getReader)return failure('INVALID');
    reader=response.body.getReader();const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();return failure('INVALID');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.pageData)||!Number.isSafeInteger(data.total)||data.total<0||data.pageData.length>15||data.total<data.pageData.length)return failure('INVALID');
    if((data.total===0)!==(data.pageData.length===0))return failure('INVALID');
    const records=[];const seen=new Set();
    for(const item of data.pageData){
     const name=type==='ip'?item?.fio:item?.name;
     if(item?.inn!==inn||!text(name)||typeof item.guid!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(item.guid)||seen.has(item.guid.toLowerCase()))return failure('INVALID');
     const evidence=JSON.stringify({inn:item.inn,guid:item.guid,[type==='ip'?'fio':'name']:name});
     if(evidence.length>2000)return failure('INVALID');
     seen.add(item.guid.toLowerCase());
     records.push({id:item.guid,summary:name.trim()+' — запись в поиске ЕФРСБ',evidence,url:ORIGIN+'/bankrupts?searchString='+inn});
    }
    return {status:'checked',identity:{inn,type},source:{id:'bankruptcy',url:url.href,checkedAt:new Date(now()).toISOString()},records,total:data.total};
   };
   return await Promise.race([work(),new Promise(resolve=>{timer=setTimeout(()=>{timedOut=true;controller.abort();resolve(failure('TIMEOUT'));},Math.max(1,Math.min(5000,timeoutMs)));}),new Promise(resolve=>controller.signal.addEventListener('abort',()=>resolve(failure(timedOut?'TIMEOUT':'BLOCKED')),{once:true}))]);
  }catch{return failure(timedOut?'TIMEOUT':controller.signal.aborted?'BLOCKED':'INVALID');}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
 };
}


