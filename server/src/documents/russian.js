const units = ['', 'одного', 'двух', 'трёх', 'четырёх', 'пяти', 'шести', 'семи', 'восьми', 'девяти'];
const teens = ['десяти', 'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати', 'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати'];
const tens = ['', '', 'двадцати', 'тридцати', 'сорока', 'пятидесяти', 'шестидесяти', 'семидесяти', 'восьмидесяти', 'девяноста'];
const hundreds = ['', 'ста', 'двухсот', 'трёхсот', 'четырёхсот', 'пятисот', 'шестисот', 'семисот', 'восьмисот', 'девятисот'];
export const MAX_POSTPAY_DAYS = 9999;
function validateDays(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_POSTPAY_DAYS) throw new RangeError('Количество дней должно быть целым от 1 до 9999.');
}
export function paymentDaysUnitGenitive(value) {
  validateDays(value);
  return value % 10 === 1 && value % 100 !== 11 ? 'календарного дня' : 'календарных дней';
}
export function numberGenitive(value) {
  validateDays(value);
  const words = [];
  if (value >= 1000) {
    const n = Math.floor(value / 1000);
    words.push(n === 1 ? 'одной тысячи' : `${units[n]} тысяч`);
    value %= 1000;
  }
  if (value >= 100) { words.push(hundreds[Math.floor(value / 100)]); value %= 100; }
  if (value >= 10 && value < 20) words.push(teens[value - 10]);
  else { if (value >= 20) words.push(tens[Math.floor(value / 10)]); if (value % 10) words.push(units[value % 10]); }
  return words.join(' ');
}
// Declension of personal names is legally significant: only a confirmed form is used.
export function confirmedNameForm(fullName, confirmedGenitive) {
  return { value: confirmedGenitive?.trim() || fullName?.trim() || '', requiresReview: !confirmedGenitive?.trim() };
}
