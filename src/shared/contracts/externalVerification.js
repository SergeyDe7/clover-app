export const REGISTRY_REQUISITE_FIELDS = Object.freeze(['type','fullName','inn','kpp','ogrn','ogrnip','legalAddress']);
const fold = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('ru');

const ipName = value => fold(value).replace(/^(?:ип|индивидуальный предприниматель)\s+/u, '');
const equalFact = (field, original, fact, type) => field === 'fullName' && type === 'ip' ? ipName(original) === ipName(fact) : fold(original) === fold(fact);

// Comparison is deliberately narrow: punctuation and address abbreviations are
// not proofs that different facts are equivalent.
export function compareRegistryFacts(original = {}, facts = {}, provenance = {}) {
  return REGISTRY_REQUISITE_FIELDS.filter(field => typeof facts[field] === 'string' && facts[field].trim()).map(field => ({
    field,original:typeof original[field] === 'string' ? original[field] : '',registry:facts[field],
    status:!fold(original[field]) ? 'proposal' : equalFact(field, original[field], facts[field], facts.type || original.type) ? 'match' : 'choice',
    sourceId:provenance.sourceId,sourceUrl:provenance.sourceUrl,checkedAt:provenance.checkedAt,evidence:provenance.evidence?.[field] || '',
  }));
}

export function resolveVerificationChoice(report, field, source) {
  if(!['original','registry'].includes(source))throw new Error('VERIFICATION_CHOICE_INVALID');
  const item=report?.comparisons?.find(row=>row.field===field);
  if(!item || !REGISTRY_REQUISITE_FIELDS.includes(field))throw new Error('VERIFICATION_FIELD_INVALID');
  return {field,value:source==='registry'?item.registry:item.original,source,...(source==='registry'?{sourceId:item.sourceId,sourceUrl:item.sourceUrl,checkedAt:item.checkedAt,evidence:item.evidence}:{})};
}
