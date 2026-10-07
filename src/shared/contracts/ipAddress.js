import {formatRecognizedAddresses} from './addressFormat.js';

// Called after AI/source-evidence merge; formatting never alters source snippets.
export function fillSharedIpAddress(result) {
  result = formatRecognizedAddresses(result);
  const fields=result.fields || {};
  if (fields.type !== 'ip' || !String(fields.legalAddress || '').trim() || String(fields.postalAddress || '').trim()) return result;
  const warnings=result.warnings || [];
  if(warnings.some(item=>item.code==='AMBIGUOUS_REQUISITE' && ['legalAddress','postalAddress','type'].includes(item.field))) return result;
  const generic=warnings.filter(item=>item.code==='ADDRESS_KIND_UNSPECIFIED' && item.field==='legalAddress');
  const source=result.provenance?.legalAddress;
  // Extra provenance matches may describe a separately labelled legal address.
  if(!generic.length || source?.source !== 'local_text' || source.snippets?.length !== generic.length) return result;
  return {...result,
    fields:{...fields,postalAddress:fields.legalAddress},
    warnings:warnings.map(item=>generic.includes(item) ? {...item,code:'IP_SHARED_ADDRESS_REVIEW',message:'Единый адрес из карточки ИП заполнен как юридический и почтовый. Проверьте оба поля.'} : item),
    provenance:{...result.provenance,postalAddress:{...source,derivedFrom:'legalAddress',sharedIpAddress:true,requiresReview:true}},
  };
}
