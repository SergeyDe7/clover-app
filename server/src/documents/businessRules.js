// Decisions supplied by the project owner on 05.10.2026.
// Setup remains an explicit operator action; importing this file never writes a DB.
// Owner confirmed: next is 1-636/255; only the last part increments, for IP and OOO together.
export const DEFAULT_CONTRACT_SEQUENCE = Object.freeze({ nextNumber: 255, prefix: '1-636/', suffix: '' });
export const POSTPAYMENT_START_EVENT = 'delivery';
export const POSTPAYMENT_START_WORDING = 'момента поставки товара';

export function formatContractNumber({ prefix = '', next_number, suffix = '' }) {
  if (!Number.isSafeInteger(next_number) || next_number < 1) throw new Error('INVALID_SEQUENCE');
  return `${prefix}${next_number}${suffix}`;
}

export const fileSafeDocumentNumber = (number) => Array.from(String(number), (char) =>
  char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char).join('');
