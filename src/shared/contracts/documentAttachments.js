export const DOCUMENT_ATTACHMENT_CATEGORIES = {
  signed_contract: 'Дополнительный подписанный скан',
  addendum: 'Допсоглашение',
  accounting: 'Бухгалтерский документ',
  other: 'Другой документ',
};

export function validateDocumentAttachment({ title, category, file }) {
  if (!Object.hasOwn(DOCUMENT_ATTACHMENT_CATEGORIES, category)) return 'Выберите тип документа.';
  const name = String(title || '').trim();
  if (!name) return 'Введите название документа.';
  if (name.length > 200) return 'Название документа должно содержать не более 200 символов.';
  if (!file || !/\.(?:pdf|jpe?g|png)$/iu.test(file.name || '') || !Number.isFinite(file.size) || file.size <= 0) return 'Выберите непустой PDF, JPG или PNG.';
  if (file.size > 10 * 1024 * 1024) return 'Размер файла не должен превышать 10 МБ.';
  return '';
}

export function canAttachDocumentFiles(document, capability, trashView = false) {
  return !trashView && document.status === 'signed' && (document.canAttachDocuments ?? capability) === true;
}
