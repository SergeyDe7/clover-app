import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStandaloneDocumentOptions } from '../../src/shared/contracts/standaloneOptions.js';
test('standalone combines authoritative archive access without overriding generator create or active suppliers', async () => {
  const options = await loadStandaloneDocumentOptions({
    getStandaloneDocumentOptions: async () => ({enabled:true,clientId:null,legalEntities:[{id:'active'}],capabilities:{create:true,uploadSigned:true}}),
    getArchiveDocumentOptions: async () => ({enabled:true,legalEntities:[{id:'active'},{id:'inactive'}],capabilities:{create:false,uploadSigned:false,archiveImport:true,delete:true,restore:true}}),
  });
  assert.equal(options.capabilities.create,true); assert.equal(options.capabilities.uploadSigned,true);
  assert.equal(options.capabilities.archiveImport,true); assert.equal(options.capabilities.restore,true);
  assert.equal(options.legalEntities.length,1); assert.equal(options.archiveLegalEntities.length,2);
});
test('archive controls stay unavailable without server permission and permission failures propagate', async () => {
  const api={getStandaloneDocumentOptions:async()=>({capabilities:{create:true}}),getArchiveDocumentOptions:async()=>({enabled:false,capabilities:{archiveImport:true,restore:true,delete:true}})};
  const options=await loadStandaloneDocumentOptions(api);assert.equal(options.capabilities.archiveImport,false);assert.equal(options.capabilities.restore,false);
  api.getArchiveDocumentOptions=async()=>{throw new Error('forbidden');};
  await assert.rejects(()=>loadStandaloneDocumentOptions(api),/forbidden/);
});
