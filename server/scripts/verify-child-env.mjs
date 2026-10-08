import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {documentChildEnv,spreadsheetText,readCardSources} from '../src/documents/extraction.js';
const env=documentChildEnv({PATH:'runtime-path',SystemRoot:'system-root',TEMP:'temp',CLOVER_DOCUMENTS_AI_API_KEY:'dummy-review-key',JWT_SECRET:'dummy-review-token',NODE_OPTIONS:'--require malicious',UNLISTED:'dummy'});
assert.deepEqual(env,{PATH:'runtime-path',SystemRoot:'system-root',TEMP:'temp',NODE_OPTIONS:''});
const directory=await mkdtemp(path.join(tmpdir(),'clover-env-review-'));
const previous=process.env.CLOVER_REVIEW_SECRET;
try {
 const helper=path.join(directory,'helper.mjs');
 await writeFile(helper,"process.stdout.write(JSON.stringify({secretInherited:Boolean(process.env.CLOVER_REVIEW_SECRET),nodeOptions:process.env.NODE_OPTIONS}));");
 process.env.CLOVER_REVIEW_SECRET='dummy-sentinel-no-real-secret';
 const spreadsheet=JSON.parse(await spreadsheetText(Buffer.from('synthetic'),'xls',{helperPath:helper}));
 assert.equal(spreadsheet.secretInherited,false);assert.equal(spreadsheet.nodeOptions,'');
 const adapter=await readCardSources(Buffer.from('synthetic'),{extension:'pdf',adapters:{pdf:{command:process.execPath,args:[helper]}}});
 const result=JSON.parse(adapter.text);assert.equal(result.secretInherited,false);assert.equal(result.nodeOptions,'');
 console.log('PASS env allowlist; spreadsheet and PDF adapter children do not inherit dummy secret; NODE_OPTIONS cleared');
} finally {if(previous===undefined)delete process.env.CLOVER_REVIEW_SECRET;else process.env.CLOVER_REVIEW_SECRET=previous;await rm(directory,{recursive:true,force:true});}
