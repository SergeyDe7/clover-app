export const SAVED_DOCUMENT_FOLDERS = { clients: 'Клиенты', suppliers: 'Поставщики', other: 'Прочее' };
export function savedDocumentFolder(document) {
  const imported = document?.kind === 'imported_contract' || document?.type === 'imported_contract';
  return imported && Object.hasOwn(SAVED_DOCUMENT_FOLDERS, document.folder) ? document.folder : 'clients';
}
export function hasSignedScan(document) {
  const imported = document?.kind === 'imported_contract' || document?.type === 'imported_contract';
  return (document?.files || []).some(file => (file.type || file.kind) === 'signed' || (imported && (file.type || file.kind) === 'original_scan') ||
    ((file.type || file.kind) === 'attachment' && file.category === 'signed_contract'));
}
export function unsignedGeneratedContractCount(documents) {
  return documents.filter(document => savedDocumentFolder(document) === 'clients' &&
    document?.kind !== 'imported_contract' && document?.type !== 'imported_contract' &&
    !document.deletedAt && !document.deleted_at && !document.trashed && !document.inTrash &&
    !['draft', 'cancelled', 'purging'].includes(document.status) &&
    String(document.number || '').trim() && !hasSignedScan(document)).length;
}
export function savedDocumentsInFolder(documents, folder = 'clients') {
  return documents.filter(document => savedDocumentFolder(document) === folder);
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
