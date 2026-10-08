import { analyzeSignerName } from './nameDeclension.js';
import { signerPositionGenitive } from './signerPosition.js';
import { normalizeRussianPhone } from './russianPhone.js';

function weightedDigit(s, weights) { return weights.reduce((sum, weight, i) => sum + weight * Number(s[i]), 0) % 11 % 10; }
export function validInn(value) {
  const s = String(value || '');
  if (!/^\d{10}(\d{2})?$/.test(s) || /^0+$/.test(s)) return false;
  return s.length === 10 ? weightedDigit(s, [2,4,10,3,5,9,4,6,8]) === Number(s[9])
    : weightedDigit(s, [7,2,4,10,3,5,9,4,6,8]) === Number(s[10]) && weightedDigit(s, [3,7,2,4,10,3,5,9,4,6,8]) === Number(s[11]);
}
export function validRegistrationNumber(value, type) {
  const s = String(value || ''); const size = type === 'ip' ? 15 : 13;
  if (!new RegExp(`^[1-9]\\d{${size - 1}}$`).test(s)) return false;
  return Number(BigInt(s.slice(0, -1)) % BigInt(size === 15 ? 13 : 11) % 10n) === Number(s.at(-1));
}
export function validateCounterparty(fields = {}) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fields = {};
  const errors = []; const warnings = [];
  const error = (field, code, message) => errors.push({ field, code, message });
  if (!['ip', 'ooo'].includes(fields.type)) error('type', 'COUNTERPARTY_TYPE_REQUIRED', 'Выберите тип контрагента.');
  for (const field of ['fullName','inn','legalAddress','bankName','bik','settlementAccount','correspondentAccount','signerFullName','signerPosition']) {
    if (typeof fields[field] !== 'string' || !fields[field].trim()) error(field, 'REQUISITE_REQUIRED', 'Заполните обязательное поле.');
  }
  if (fields.inn && (!validInn(fields.inn) || (fields.type === 'ip' && String(fields.inn).length !== 12) || (fields.type === 'ooo' && String(fields.inn).length !== 10))) error('inn', 'INN_INVALID', 'Проверьте ИНН.');
  if (fields.type === 'ooo' && !/^\d{9}$/.test(fields.kpp || '')) error('kpp', 'KPP_INVALID', 'КПП должен содержать 9 цифр.');
  const regField = fields.type === 'ip' ? 'ogrnip' : 'ogrn';
  if (!validRegistrationNumber(fields[regField], fields.type)) error(regField, 'REGISTRATION_NUMBER_INVALID', 'Проверьте регистрационный номер.');
  for (const [field, length] of [['bik',9],['settlementAccount',20],['correspondentAccount',20]]) if (fields[field] && !new RegExp(`^\\d{${length}}$`).test(fields[field])) error(field, 'BANK_REQUISITE_INVALID', `Поле должно содержать ${length} цифр.`);
  for (const [field,label] of [['phone','телефон'],['email','email']]) {
    if (typeof fields[field] !== 'string' || !fields[field].trim()) warnings.push({field,code:'CONTACT_OMITTED',message:`Не указан ${label} покупателя. После подтверждения договор будет создан без этого контакта.`});
  }
  if (fields.email != null && String(fields.email).trim() !== '' && !validContactEmails(fields.email)) error('email', 'EMAIL_INVALID', 'Проверьте контакты: до 20 строк, в каждой подпись и один корректный email.');
  if (fields.edo !== undefined && (typeof fields.edo !== 'string' || fields.edo.length > 2000 || [...fields.edo].some(char => {
    const code = char.codePointAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127 || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff;
  }))) error('edo', 'EDO_INVALID', 'Проверьте реквизиты ЭДО: текст до 2000 символов без служебных знаков.');
  warnings.push({ code: 'EXTERNAL_VERIFICATION_NOT_PERFORMED', message: 'Существование контрагента и полномочия подписанта требуют проверки.' });
  return { errors, warnings };
}
// Labels describe contacts; each non-empty line has exactly one address at its end.
// Keep a legacy single bare address valid, without treating different contacts as ambiguity.
export function validContactEmails(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return false;
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 20) return false;
  return lines.every(line => {
    const match = line.trim().match(/^(?:(.{1,160})\s+)?([A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)$/u);
    if (!match || match[2].length > 254 || (match[1] && [...match[1]].some(char => char === '@' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) return false;
    const [local, domain] = match[2].split('@');
    return local.length <= 64 && domain.split('.').every(label => label.length <= 63);
  });
}

const normalized = value => String(value || '').normalize('NFC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('ru');
// Technical checks only: a valid format never proves company existence or signing powers.
export function analyzeCounterparty(input={}, {provenance={},warnings:sourceWarnings=[],manualChanges={}}={}) {
  const values=input && typeof input==='object' && !Array.isArray(input)?input:{};
  const has=field=>typeof values[field]==='string' && Boolean(values[field].trim());
  const validation=validateCounterparty(values);
  const warnings=[...validation.warnings];
  const statuses=new Map();
  const set=(field,status,message)=>statuses.set(field,{field,status,message,...(provenance[field]?{source:provenance[field]}:{})});
  const required=['type','fullName','inn','legalAddress','bankName','bik','settlementAccount','correspondentAccount','signerFullName','signerPosition','signerFullNameGenitive','signerPositionGenitive',...(values.type==='ip'?['ogrnip']:values.type==='ooo'?['kpp','ogrn']:[])];
  const structural=new Set(['type','inn','kpp','ogrn','ogrnip','bik','settlementAccount','correspondentAccount']);
  for(const field of required) set(field,has(field)?'checked':'needs_input',has(field)?(structural.has(field)?'Формат проверен автоматически; достоверность данных проверяется отдельно.':'Поле заполнено.'): 'Заполните обязательное поле.');
  for(const field of ['postalAddress','phone','email','edo']) set(field,has(field)?'checked':'optional',has(field)?(['postalAddress','edo'].includes(field)?'Поле заполнено.':'Формат проверен автоматически.'):'Необязательный реквизит.');
  for(const error of validation.errors) set(error.field,'needs_input',error.message);
  const review=(field,code,message)=>{if(statuses.get(field)?.status!=='needs_input')set(field,'needs_review',message);warnings.push({field,code,message});};
  const name=analyzeSignerName(values.signerFullName);
  if(!has('signerFullNameGenitive') && name.status!=='resolved')set('signerFullNameGenitive','needs_input',name.reason || 'Введите родительный падеж ФИО вручную.');
  if(has('signerFullNameGenitive')) {
    if(name.status!=='resolved') review('signerFullNameGenitive','NAME_DECLENSION_UNRESOLVED','Для этого ФИО нет надёжного правила склонения. Проверьте введённую форму.');
    else if(normalized(values.signerFullNameGenitive)!==normalized(name.value)) review('signerFullNameGenitive','NAME_GENITIVE_MISMATCH',`По грамматическому правилу ожидается «${name.value}». Проверьте указанную форму.`);
    else set('signerFullNameGenitive','checked','Родительный падеж определён по грамматическому правилу.');
  }
  const position=signerPositionGenitive(values.signerPosition);
  if(!has('signerPositionGenitive') && !position)set('signerPositionGenitive','needs_input','Должность не входит в словарь склонений. Введите родительный падеж вручную.');
  if(has('signerPositionGenitive')) {
    if(!position) review('signerPositionGenitive','POSITION_DECLENSION_UNRESOLVED','Должность не входит в словарь склонений. Проверьте форму.');
    else if(normalized(values.signerPositionGenitive)!==normalized(position)) review('signerPositionGenitive','POSITION_GENITIVE_MISMATCH',`Ожидаемая форма: «${position}». Проверьте указанную форму.`);
    else set('signerPositionGenitive','checked','Родительный падеж должности проверен по словарю.');
  }
  if(has('phone')) {
    const phones=values.phone.split(/[;\n]/u).map(value=>value.trim()).filter(Boolean);
    if(!phones.length || phones.some(value=>normalizeRussianPhone(value)===null)) review('phone','PHONE_REVIEW_REQUIRED','Телефон неполный или содержит международный код, подпись либо добавочный номер. Проверьте контакт.');
  }
  if(values.type==='ip' && normalized(values.signerPosition)==='индивидуальный предприниматель') {
    const owner=String(values.fullName || '').replace(/^(?:ИП|Индивидуальный предприниматель)\s+/iu,'');
    if(owner && values.signerFullName && normalized(owner)!==normalized(values.signerFullName)) review('signerFullName','IP_SIGNER_OWNER_MISMATCH','Подписант отличается от владельца ИП. Проверьте ФИО и должность представителя.');
  }
  for(const item of sourceWarnings) {
    // Empty contacts are explicitly omittable in the submission confirmation.
    // A source ambiguity must not require acknowledging an absent value.
    if(['phone','email'].includes(item.field) && !has(item.field)) continue;
    if(values.type==='ip' && item.field==='legalAddress' && item.code==='IP_SHARED_ADDRESS_REVIEW') {
      for(const field of ['legalAddress','postalAddress']) if(!manualChanges[field]) review(field,item.code,item.message);
      continue;
    }
    const collectedEmails=item.field==='email' && validContactEmails(values.email) && item.candidates?.length>1 && item.candidates.every(value=>normalized(values.email).includes(normalized(value)));
    if(item.field && item.code==='AMBIGUOUS_REQUISITE' && !manualChanges[item.field] && !collectedEmails) review(item.field,item.code,'В источнике несколько вариантов. Уточните значение.');
    else if(item.field && ['ADDRESS_KIND_UNSPECIFIED','REGISTRATION_LABEL_MISMATCH','AI_SOURCE_REVIEW'].includes(item.code) && !manualChanges[item.field]) review(item.field,item.code,item.message);
  }
  const fields=[...statuses.values()];
  return {fields,errors:validation.errors,warnings,needsAttention:fields.filter(item=>['needs_input','needs_review'].includes(item.status))};
}
