import { verifyCounterparty } from './counterpartyVerification.js';
import { REGISTRY_REQUISITE_FIELDS } from '../../../src/shared/contracts/externalVerification.js';
import { documentError } from './storage.js';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export function validateVerificationChoices(input) {
  if(input===undefined)return {};
  if(!plain(input)||Object.keys(input).some(key=>!['choices','expectedRegistry'].includes(key)))throw documentError('FNS_CHOICES_INVALID','Проверьте выбор реквизитов ФНС.');
  const choices=input.choices;
  if(!plain(choices)||Object.keys(choices).some(key=>!REGISTRY_REQUISITE_FIELDS.includes(key)||!['original','registry'].includes(choices[key])))throw documentError('FNS_CHOICES_INVALID','Проверьте выбор реквизитов ФНС.');
  const expected=input.expectedRegistry;
  if(expected!==undefined&&(!plain(expected)||Object.keys(expected).some(key=>!REGISTRY_REQUISITE_FIELDS.includes(key)||typeof expected[key]!=='string'||expected[key].length>2000)))throw documentError('FNS_CHOICES_INVALID','Проверьте ожидаемые значения ФНС.');
  return {...choices};
}
// Mandatory attempt, advisory result: registry failures never veto generation or rewrite card fields.
export async function enforceRequiredFns({fields,verification,storedVerification,adapters={},now}={}) {
  const choices=storedVerification?.choices || validateVerificationChoices(verification);
  const report=await verifyCounterparty({fields,adapters:{fns:adapters.fns},...(now?{now}:{})});
  const source=report.sources.find(item=>item.id==='fns');
  const warnings=[];const decisions=[];
  if(!source||!['checked','partial'].includes(source.status))warnings.push({code:source?.code || 'FNS_NOT_VERIFIED',message:source?.message || 'ФНС не подтвердила сведения. Договор создан по текущим реквизитам карточки.'});
  if(source?.status==='partial')warnings.push({code:'FNS_PARTIAL',message:'ФНС подтвердила часть сведений. Полный адрес не проверен.'});
  for(const item of report.comparisons.filter(item=>item.sourceId==='fns')) {
    if(item.status==='match')continue;
    const choice=choices[item.field];const prior=storedVerification?.decisions?.find(row=>row.field===item.field);
    const currentPair=storedVerification?prior?.choice===choice&&prior.original===item.original&&prior.registry===item.registry&&prior.sourceUrl===item.sourceUrl:verification?.expectedRegistry?.[item.field]===item.registry;
    if(item.status==='choice'&&choice==='original'&&currentPair){decisions.push({...item,choice:'original',status:'confirmed'});continue;}
    const status=choice?'stale':'unresolved';decisions.push({...item,choice:'retained_current',status});
    warnings.push({field:item.field,code:status==='stale'?'FNS_DECISION_STALE':'FNS_CONFLICT_UNRESOLVED',message:item.status==='proposal'?'В ФНС есть подтверждённое значение. Текущее поле карточки сохранено.':'Сведения отличаются от ФНС. В договоре сохранено текущее значение карточки; расхождение не подтверждено.'});
  }
  return {report,choices:{...choices},decisions,warnings};
}
