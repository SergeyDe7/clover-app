import { POSTPAYMENT_START_WORDING } from './businessRules.js';
export { validInn, validRegistrationNumber, validateCounterparty, validContactEmails, analyzeCounterparty } from '../../../src/shared/contracts/requisiteChecks.js';

export function validateTemplateText(text, { paymentType, previousClientTokens = [] } = {}) {
  const errors = [];
  if (/\{\{[^}]+\}\}|\$\{[^}]+\}/.test(text)) errors.push({ code: 'TEMPLATE_PLACEHOLDER_UNRESOLVED', message: 'В документе остались незаполненные поля.' });
  if (paymentType === 'postpayment' && /(?:с даты|со дня|после|от даты)\s+(?:получения\s+)?предоплат/iu.test(text)) errors.push({ code: 'PAYMENT_CLAUSE_CONFLICT', message: 'Условия поставки ссылаются на предоплату при постоплате.' });
  if (paymentType === 'postpayment' && !text.toLocaleLowerCase('ru').replace(/\s+/g,' ').includes(POSTPAYMENT_START_WORDING)) errors.push({ code: 'PAYMENT_START_REQUIRED', message: 'Укажите в утверждённом шаблоне начало отсрочки с момента поставки товара (переменная PAYMENT_START_EVENT).' });
  if (previousClientTokens.some(token => token && text.toLocaleLowerCase('ru').includes(token.toLocaleLowerCase('ru')))) errors.push({ code: 'PREVIOUS_COUNTERPARTY_DATA', message: 'Обнаружены данные исходного покупателя.' });
  return { errors };
}
