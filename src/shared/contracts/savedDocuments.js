export function hasSignedScan(document) {
  return (document.files || []).some(file => file.type === 'signed');
}
const normalizeName = value => String(value || '').normalize('NFC').toLocaleLowerCase('ru-RU').replace(/ё/gu,'е').replace(/[«»“”„"]/gu,'').trim().replace(/\s+/gu,' ');
const withoutLegalForm = value => value.replace(/^(?:общество с ограниченной ответственностью|индивидуальный предприниматель|ооо|ип)(?:\s+|$)/u,'');
export function filterSavedDocuments(documents, input) {
  const query=normalizeName(input);
  if (!query) return documents;
  const digits=query.replace(/\s/gu,'');
  if (/^\d+$/u.test(digits)) return digits.length>12 ? [] : documents.filter(document=>String(document.counterparty?.inn || '').includes(digits));
  const namePrefix=withoutLegalForm(query);
  return documents.filter(document=>{
    const name=normalizeName(document.counterparty?.fullName);
    return name.startsWith(query) || Boolean(namePrefix && withoutLegalForm(name).startsWith(namePrefix));
  });
}
