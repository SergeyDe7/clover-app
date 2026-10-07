import { analyzeSignerName } from './nameDeclension.js';
export { fillSignerNameGenitive } from './nameDeclension.js';

// Compatibility export: now supports both male and female full names.
export function suggestedMaleNameGenitive(fullName) {
  return analyzeSignerName(fullName).value;
}
export function fillIpSignerFromCard(fields) {
  if (fields.type !== 'ip') return fields;
  const heading = String(fields.fullName || '').normalize('NFC').trim().match(/^(?:Индивидуальный предприниматель|ИП)\s+(.+)$/iu);
  if (!heading || !/^[А-ЯЁа-яё]+(?:-[А-ЯЁа-яё]+)*\s+[А-ЯЁа-яё]+(?:-[А-ЯЁа-яё]+)*\s+[А-ЯЁа-яё]+(?:\s+(?:оглы|кызы))?$/iu.test(heading[1])) return fields;
  const owner = heading[1];
  const current = String(fields.signerFullName || '').trim();
  // An explicit representative in the card must never be replaced by the owner.
  if (current && current.toLocaleLowerCase('ru-RU') !== owner.toLocaleLowerCase('ru-RU')) return fields;
  const next = { ...fields, signerFullName: current || owner };
  if (!String(next.signerPosition || '').trim()) next.signerPosition = 'Индивидуальный предприниматель';
  if (!String(next.signerFullNameGenitive || '').trim()) next.signerFullNameGenitive = suggestedMaleNameGenitive(next.signerFullName);
  return next;
}

export function refreshSuggestedName(fields, previousAutoValue) {
  if (previousAutoValue === null || previousAutoValue === undefined || fields.signerFullNameGenitive !== previousAutoValue) return {fields,autoValue:null};
  const value=suggestedMaleNameGenitive(fields.signerFullName);
  return {fields:{...fields,signerFullNameGenitive:value},autoValue:value};
}
