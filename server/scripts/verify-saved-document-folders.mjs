import test from 'node:test';
import assert from 'node:assert/strict';
import {savedDocumentFolder,savedDocumentsInFolder,unsignedGeneratedContractCount,hasSignedScan,filterSavedDocuments} from '../../src/shared/contracts/savedDocuments.js';
const contract=(id,extra={})=>({id,kind:'contract',status:'generated',number:'1-636/'+id,counterparty:{fullName:'ООО Тест '+id,inn:'7707083893'},files:[{type:'docx'},{type:'pdf'}],...extra});
test('generated contracts stay in Clients; missing/invalid legacy archive folder defaults Clients',()=>{
 assert.equal(savedDocumentFolder(contract('1',{folder:'suppliers'})),'clients');
 for(const document of [{kind:'imported_contract'},{type:'imported_contract'},{kind:'imported_contract',folder:'unknown'}])assert.equal(savedDocumentFolder(document),'clients');
 for(const folder of ['clients','suppliers','other'])assert.equal(savedDocumentFolder({kind:'imported_contract',folder}),folder);
});
test('signed scan is durable uploaded evidence, including signed-contract attachment, never status or unrelated files',()=>{
 assert.equal(hasSignedScan(contract('1',{status:'signed'})),false);
 assert.equal(hasSignedScan({kind:'imported_contract',files:[{type:'original_scan'}]}),true);
 assert.equal(hasSignedScan(contract('2',{files:[{type:'signed'}]})),true);
 assert.equal(hasSignedScan(contract('3',{files:[{type:'attachment',category:'signed_contract'}]})),true);
 assert.equal(hasSignedScan(contract('4',{files:[{kind:'attachment',category:'signed_contract'}]})),true);
 for(const files of [[{type:'attachment',category:'act'}],[{type:'pdf',category:'signed_contract'}],[{type:'original_scan'}],[]])assert.equal(hasSignedScan(contract('5',{files})),false);
});
test('badge counts numbered generated and archived/signed-without-scan; excludes drafts, cancelled, imports, trash and real scans',()=>{
 const documents=[contract('1'),contract('2',{status:'sent'}),contract('3',{status:'signing'}),contract('4',{status:'signed'}),contract('5',{status:'archived'}),
  contract('6',{status:'draft'}),contract('7',{status:'cancelled'}),contract('8',{number:null}),contract('9',{number:' '}),contract('10',{deletedAt:'2026-10-08'}),contract('11',{status:'purging'}),
  contract('12',{files:[{type:'signed'}]}),contract('13',{files:[{type:'attachment',category:'signed_contract'}]}),contract('14',{kind:'imported_contract',folder:'clients',files:[{type:'original_scan'}]}),contract('15',{type:'imported_contract'})];
 assert.equal(unsignedGeneratedContractCount(documents),5);
 assert.equal(unsignedGeneratedContractCount(documents.map(d=>({...d,trashed:true}))),0);
});
test('folder filtering composes name/INN and trash; badge remains independent of selected folder/search',()=>{
 const documents=[contract('1'),{id:'s',kind:'imported_contract',folder:'suppliers',counterparty:{fullName:'ООО Поставщик',inn:'1234567890'}},{id:'o',kind:'imported_contract',folder:'other',counterparty:{fullName:'ИП Прочее'}},{id:'legacy',kind:'imported_contract',counterparty:{fullName:'ООО Старый'}}];
 assert.deepEqual(savedDocumentsInFolder(documents,'clients').map(d=>d.id),['1','legacy']);
 assert.deepEqual(filterSavedDocuments(savedDocumentsInFolder(documents,'suppliers'),'пост').map(d=>d.id),['s']);
 assert.deepEqual(filterSavedDocuments(savedDocumentsInFolder(documents,'other'),'123'),[]);
 assert.equal(unsignedGeneratedContractCount(documents),1);
 const trash=[{...documents[1],deletedAt:'2026-10-08'},{...documents[3],deletedAt:'2026-10-08'}];
 assert.deepEqual(savedDocumentsInFolder(trash,'suppliers').map(d=>d.id),['s']);
 assert.deepEqual(savedDocumentsInFolder(trash,'clients').map(d=>d.id),['legacy']);
 assert.equal(unsignedGeneratedContractCount(trash),0);
});
test('refresh after signed attachment or trash removes badge; restoring an unsigned generated contract brings it back',()=>{
 const pending=contract('1');assert.equal(unsignedGeneratedContractCount([pending]),1);
 assert.equal(unsignedGeneratedContractCount([{...pending,files:[...pending.files,{type:'attachment',category:'signed_contract'}]}]),0);
 assert.equal(unsignedGeneratedContractCount([]),0);
 assert.equal(unsignedGeneratedContractCount([{...pending,deletedAt:null}]),1);
});
