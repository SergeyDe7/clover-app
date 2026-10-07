export function assertRuntimeOptions(options,expectAI) {
 if(options.enabled!==true||options.capabilities?.create!==true||options.blockers?.length||options.verification?.required!==true||options.verification?.blocking!==false||!options.verification?.sources?.some(s=>s.id==='fns'&&s.configured===true)||options.legalEntities?.length!==2)throw new Error('DOCUMENT_RUNTIME_ACCEPTANCE_FAILED');
 const ai=options.ai;
 if(typeof expectAI!=='boolean'||ai?.onlyWhenNeeded!==false)throw new Error('AI_POLICY_ACCEPTANCE_FAILED');
 if(expectAI) {
  if(ai.available!==true||ai.provider!=='openai'||ai.autoRecognition!==true)throw new Error('AI_RUNTIME_ACCEPTANCE_FAILED');
 }else if(ai.available!==false||ai.provider!=='disabled'||ai.autoRecognition!==false)throw new Error('AI_DISABLED_STATUS_NOT_HONEST');
}
