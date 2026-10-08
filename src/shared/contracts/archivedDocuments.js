export const isImportedContract = document => document?.kind === 'imported_contract' || document?.type === 'imported_contract';

export function validateArchivedDocumentInput({ draft = {}, file } = {}) {
  const errors = [];
  if (!draft.legalEntityId) errors.push('Выберите наше юрлицо.');
  const number = String(draft.number || '').trim();
  if (!number) errors.push('Укажите номер старого договора.');
  else if (number.length > 100) errors.push('Номер старого договора должен содержать не более 100 символов.');
  if (!String(draft.fullName || '').trim()) errors.push('Укажите наименование клиента.');
  if (!file || !/\.(?:pdf|jpe?g|png)$/iu.test(file.name || '') || file.size === 0) errors.push('Выберите подписанный договор в PDF, JPG или PNG.');
  if (file?.size > 10 * 1024 * 1024) errors.push('Размер подписанного договора не должен превышать 10 МБ.');
  return errors;
}
