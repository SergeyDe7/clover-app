const SEPARATORS = /[\s()\-\u2010-\u2014]/gu;

function digitsOf(value) {
  const compact = value.trim().replace(SEPARATORS, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  return { digits: compact.replace(/^\+/, ''), international: compact.startsWith('+') };
}

function renderSubscriber(digits) {
  let result = '+7';
  if (digits.length) result += ` (${digits.slice(0, 3)}`;
  if (digits.length > 3) result += `) ${digits.slice(3, 6)}`;
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

// null means unsupported/incomplete: preserve the original, never truncate digits.
export function normalizeRussianPhone(value) {
  if (typeof value !== 'string') return null;
  if (!value.trim()) return '';
  const parsed = digitsOf(value);
  if (!parsed) return null;
  let subscriber;
  if (parsed.digits.length === 11 && (parsed.digits[0] === '7' || (!parsed.international && parsed.digits[0] === '8'))) subscriber = parsed.digits.slice(1);
  else if (!parsed.international && parsed.digits.length === 10) subscriber = parsed.digits;
  else return null;
  return renderSubscriber(subscriber);
}

// A partial mask ends in a digit, so backspace does not get stuck on separators.
export function formatRussianPhoneInput(value) {
  const complete = normalizeRussianPhone(value);
  if (complete !== null) return complete;
  if (typeof value !== 'string') return '';
  const parsed = digitsOf(value);
  if (!parsed || parsed.digits.length > 11 || (parsed.international && parsed.digits[0] !== '7')) return value;
  const subscriber = parsed.international || /^[78]/.test(parsed.digits) ? parsed.digits.slice(1) : parsed.digits;
  if (subscriber.length > 10) return value;
  return renderSubscriber(subscriber);
}

export function russianPhoneCaret(value, formatted, selectionStart) {
  if (formatted === value || selectionStart === null) return selectionStart;
  if (selectionStart === 0) return 0;
  const count = value.slice(0, selectionStart).replace(/\D/g, '').length;
  const added = Math.max(0, formatted.replace(/\D/g, '').length - value.replace(/\D/g, '').length);
  let remaining = count + added;
  for (let index = 0; index < formatted.length; index++) {
    if (/\d/.test(formatted[index]) && --remaining === 0) return index + 1;
  }
  return formatted.length;
}
