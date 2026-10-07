// Only explicit, reviewed grammatical forms. Unknown job titles are not guessed.
const GENITIVE_POSITIONS = new Map([
  ['генеральный директор', 'генерального директора'],
  ['директор', 'директора'],
  ['исполнительный директор', 'исполнительного директора'],
  ['коммерческий директор', 'коммерческого директора'],
  ['финансовый директор', 'финансового директора'],
  ['управляющий директор', 'управляющего директора'],
  ['заместитель генерального директора', 'заместителя генерального директора'],
  ['заместитель директора', 'заместителя директора'],
  ['главный бухгалтер', 'главного бухгалтера'],
  ['бухгалтер', 'бухгалтера'],
  ['представитель', 'представителя'],
  ['представитель по доверенности', 'представителя по доверенности'],
  ['директор по развитию', 'директора по развитию'],
  ['директор по продажам', 'директора по продажам'],
  ['директор по закупкам', 'директора по закупкам'],
  ['директор по качеству', 'директора по качеству'],
  ['управляющий', 'управляющего'],
  ['управляющая', 'управляющей'],
  ['руководитель', 'руководителя'],
  ['председатель', 'председателя'],
  ['президент', 'президента'],
  ['индивидуальный предприниматель', 'индивидуального предпринимателя'],
]);

export function signerPositionGenitive(position) {
  if (typeof position !== 'string') return '';
  const key = position.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU');
  return GENITIVE_POSITIONS.get(key) || '';
}

// Preserve explicit imported/manual values. Refresh only an empty or owned suggestion.
export function fillSignerPositionGenitive(fields, previousAutoValue = null) {
  const current = fields.signerPositionGenitive || '';
  if (current.trim() && (previousAutoValue === null || current !== previousAutoValue)) {
    return { fields, autoValue: null };
  }
  const value = signerPositionGenitive(fields.signerPosition);
  return { fields: { ...fields, signerPositionGenitive: value }, autoValue: value || null };
}
