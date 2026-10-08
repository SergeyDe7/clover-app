import { analyzeCounterparty } from './requisiteChecks.js';
import { isFieldReviewConfirmed, relevantRequisiteAttention } from './reviewAcknowledgements.js';

const LABELS = { type: 'Тип клиента', fullName: 'Полное наименование', inn: 'ИНН', kpp: 'КПП', ogrn: 'ОГРН', ogrnip: 'ОГРНИП', legalAddress: 'Юридический адрес', bankName: 'Банк', bik: 'БИК', settlementAccount: 'Расчётный счёт', correspondentAccount: 'Корреспондентский счёт', signerFullName: 'ФИО подписанта', signerFullNameGenitive: 'ФИО подписанта в родительном падеже', signerPosition: 'Должность подписанта', signerPositionGenitive: 'Должность подписанта в родительном падеже', postalAddress: 'Почтовый адрес', phone: 'Телефон', email: 'Email', edo: 'ЭДО' };

export function checkDocumentPreflight({ fields = {}, provenance, warnings, manualChanges, reviews = {}, supplier, date, paymentType, days, confirmed, alternativeRequired, generate = true } = {}) {
  const checks = analyzeCounterparty(fields, { provenance, warnings, manualChanges });
  const errors = [];
  const add = (field, code, message) => errors.push({ field, code, message });
  if (alternativeRequired) add('card-alternative', 'CARD_SHEET_REQUIRED', 'Выберите лист с карточкой клиента.');
  if (!supplier) add('legalEntityId', 'SUPPLIER_REQUIRED', 'Выберите наше юрлицо.');
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) add('date', 'DATE_REQUIRED', 'Выберите корректную дату договора.');
  if (!['prepayment', 'postpayment'].includes(paymentType)) add('paymentType', 'PAYMENT_TYPE_REQUIRED', 'Выберите условия оплаты.');
  if (paymentType === 'postpayment' && (!/^\d+$/u.test(String(days)) || !Number.isSafeInteger(Number(days)) || Number(days) < 1 || Number(days) > 9999)) add('days', 'POSTPAYMENT_DAYS_INVALID', 'Введите целое число отсрочки от 1 до 9999 календарных дней.');
  for (const item of relevantRequisiteAttention(fields, checks)) {
    if (item.status === 'needs_input' && generate) add(item.field, 'REQUISITE_INVALID', `${LABELS[item.field] || item.field}: ${item.message}`);
    else if (item.status === 'needs_review' && !isFieldReviewConfirmed(fields, reviews, item.field)) add(item.field, 'REVIEW_REQUIRED', `${LABELS[item.field] || item.field}: подтвердите указанное значение рядом с полем.`);
  }
  if (confirmed !== true) add('confirmed', 'CONFIRMATION_REQUIRED', 'Подтвердите юрлицо, дату и условия договора, включая отсутствие необязательных контактов.');
  return { valid: errors.length === 0, errors, warnings: checks.warnings, firstField: errors[0]?.field };
}

// Submission and all network work run only after synchronous checks.
export function guardDocumentSubmission(input, submit) {
  const preflight = checkDocumentPreflight(input);
  return { preflight, pending: preflight.valid ? submit() : undefined };
}
