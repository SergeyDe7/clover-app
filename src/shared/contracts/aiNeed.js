// AI can recover missing source facts, never invent facts or settle ambiguity.
const present = value => typeof value === 'string' && Boolean(value.trim());
const numericCue = (label, size) => new RegExp(`(?:${label})[^\\d\\n]{0,80}\\s*(?:${(Array.isArray(size)?size:[size]).map(length=>`\\d(?:[ \\t\\u00a0]*\\d){${length-1}}`).join('|')})(?![ \\t\\u00a0]*\\d)`, 'iu');
const cues = {
  type: /(?:^|[\s(])(?:ИП|ООО|индивидуальный\s+предприниматель|общество\s+с\s+ограниченной\s+ответственностью)(?=[\s)]|$)/iu,
  fullName: /(?:ИП|индивидуальный\s+предприниматель)\s+[А-ЯЁ][\p{L}-]+\s+[А-ЯЁ][\p{L}.-]+|(?:ООО|общество\s+с\s+ограниченной\s+ответственностью)\s*[«"][^»"\n]+|(?:наименование|название)(?!\s+банка)(?:\s+(?:организации|предприятия|компании))?\s*[:\t]\s*\p{L}/iu,
  inn: numericCue('ИНН', [12,10]),
  kpp: numericCue('КПП', 9),
  ogrn: numericCue('ОГРН(?!ИП)', 13),
  ogrnip: numericCue('ОГРНИП', 15),
  bik: numericCue('БИК', 9),
  settlementAccount: numericCue('р\\s*[/.]\\s*с|расч[её]тн[\\p{L} ]*сч[её]т|номер[\\p{L} ]*сч[её]та', 20),
  correspondentAccount: numericCue('к\\s*[/.]\\s*с|корр?[\\p{L}. ]*сч[её]т', 20),
  legalAddress: /(?:адрес|место\s+(?:нахождения|жительства)|регистраци[яи])[^\n]{0,100}(?:ул\.?|улица|город|\bг\.|область|край|район)|(?:улица|ул\.)\s*[\p{L} .-]+[, ]+(?:дом|д\.)\s*\d/iu,
  bankName: /(?:банк|bank)[ \t]*[:\t][ \t]*\p{L}|(?:ПАО|АО|ООО)\s*[«"]?[^\n]{0,100}(?:банк|сбер)/iu,
  signerFullName: /(?:подписант|ФИО|директор|предприниматель)[^\n]{0,60}[А-ЯЁ][\p{L}-]+\s+[А-ЯЁ][\p{L}.]+/iu,
  signerPosition: /(?:должность|подписант)[^\n]{0,40}(?:директор|предприниматель|управляющий)|(?:генеральный|исполнительный|коммерческий)\s+директор/iu,
};

function customerIdentityText(text) {
  let banking = false;
  return text.split(/\r?\n/u).filter(line => {
    // A company label explicitly ends a previous bank block. Unlabelled legal
    // forms inside that block belong to the bank, not necessarily the customer.
    const customerLabel = /^(?:\s*)(?:(?:полное\s+)?(?:наименование|название)(?:\s+(?:организации|предприятия|компании|покупателя|клиента))?\s*[:\t]|(?:реквизиты|карточка)\s+(?:организации|предприятия|покупателя|клиента)(?=[\s:]|$))/iu.test(line);
    if(customerLabel) { banking = false; return true; }
    if(/(?:банковские\s+реквизиты|(?:наименование\s+)?банка?[ \t]*[:\t])/iu.test(line)) { banking = true; return false; }
    return !banking;
  }).join('\n');
}

export function decideCardAINeed(result = {}, sourceText = '') {
  const fields = result.fields || {};
  const ambiguous = new Set((result.warnings || []).filter(item => item.code === 'AMBIGUOUS_REQUISITE').map(item => item.field));
  const required = ['type','fullName','inn','legalAddress','bankName','bik','settlementAccount','correspondentAccount','signerFullName','signerPosition', ...(fields.type === 'ip' ? ['ogrnip'] : fields.type === 'ooo' ? ['ogrn','kpp'] : [])];
  const missing = required.filter(field => !present(fields[field]));
  const hints = result.aiNeed?.sourceFields || [];
  const text = typeof sourceText === 'string' ? sourceText.normalize('NFC') : '';
  const identityText = customerIdentityText(text);
  const sourceFields = typeof sourceText === 'string' && sourceText.trim()
    ? Object.keys(cues).filter(field => cues[field].test(['type','fullName','signerFullName','signerPosition'].includes(field) ? identityText : text))
    : hints.filter(field => Object.hasOwn(cues, field));
  const recoverable = missing.filter(field => !ambiguous.has(field) && sourceFields.includes(field));
  return {needed:recoverable.length > 0,reason:recoverable.length ? 'SOURCE_FACTS_UNRESOLVED' : !missing.length ? 'LOCAL_FACTS_COMPLETE' : 'NO_RECOVERABLE_SOURCE_FACTS',fields:recoverable,sourceFields};
}
