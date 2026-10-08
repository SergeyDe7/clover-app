import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { documentError, DOCUMENT_MAX_BYTES } from './storage.js';

// Fixed local parser, never document-provided commands or remote services.
export function validateSignedDocument(buffer,extension,{python,timeoutMs=10000}={}) {
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>DOCUMENT_MAX_BYTES||!['pdf','png','jpg','jpeg'].includes(extension))return Promise.reject(documentError('DOCUMENT_FILE_UNREADABLE','Файл договора повреждён или не читается.'));
 if(typeof python!=='string'||!path.isAbsolute(python))return Promise.reject(documentError('DOCUMENT_FILE_VALIDATOR_UNAVAILABLE','Настройте локальную проверку PDF и изображений.',503));
 return new Promise((resolve,reject)=>{
  let settled=false;let output='';
  const child=spawn(python,[fileURLToPath(new URL('./file-validation-child.py',import.meta.url)),extension],{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({readable:true});};
  const timer=setTimeout(()=>{child.kill();finish(documentError('DOCUMENT_FILE_VALIDATION_TIMEOUT','Проверка файла заняла слишком много времени. Попробуйте уменьшить файл.'));},Math.min(10000,Math.max(1,timeoutMs)));
  child.on('error',()=>finish(documentError('DOCUMENT_FILE_VALIDATOR_UNAVAILABLE','Локальная проверка файлов недоступна.',503)));
  child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(output.length>16384){child.kill();finish(documentError('DOCUMENT_FILE_UNREADABLE','Файл договора повреждён или превышает ограничения проверки.'));}});
  child.stdin.on('error',()=>{});
  child.on('close',code=>{if(code===0&&output.trim()==='OK')finish();else finish(documentError(output.trim()==='UNAVAILABLE'?'DOCUMENT_FILE_VALIDATOR_UNAVAILABLE':'DOCUMENT_FILE_UNREADABLE',output.trim()==='UNAVAILABLE'?'Установите локальные библиотеки проверки файлов.':'Файл договора повреждён или не читается.',output.trim()==='UNAVAILABLE'?503:422));});
  child.stdin.end(buffer);
 });
}
