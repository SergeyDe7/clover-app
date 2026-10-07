import { validInn } from './requisiteChecks.js';
import { REGISTRY_REQUISITE_FIELDS, resolveVerificationChoice } from './externalVerification.js';

const OFFICIAL_ORIGINS = new Set(['https://egrul.nalog.ru', 'https://service.nalog.ru', 'https://kad.arbitr.ru', 'https://fssp.gov.ru', 'https://is.fssp.gov.ru']);

export function officialVerificationUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    return OFFICIAL_ORIGINS.has(url.origin) ? url.href : null;
  } catch { return null; }
}

export const verificationFingerprint = fields => JSON.stringify(Object.keys(fields || {}).sort().map(key => [key, String(fields[key] ?? '')]));

export function hasVerifiedRegistryField(report, field) {
  return Boolean(report?.sources?.some(source => source.id === 'fns' && (source.status === 'checked' || (source.status === 'partial' && Array.isArray(source.checkedFields) && source.checkedFields.includes(field)))));
}

// A recognition ticket is consumed once; edits, reset and unmount invalidate its epoch.
export function canAutomaticallyVerify(ticket, { configured, busy, alternativeRequired, fields, epoch, alive }) {
  return Boolean(ticket && configured && !busy && !alternativeRequired && alive && ticket.epoch === epoch && ticket.fingerprint === verificationFingerprint(fields) && /^(?:\d{10}|\d{12})$/.test(String(fields.inn || '')));
}

export function applyEmptyRegistryProposals(fields, report, expectedFingerprint) {
  if (verificationFingerprint(fields) !== expectedFingerprint) return { fields, applied: [], stale: true };
  if (!report?.sources?.some(source => source.id === 'fns' && ['checked', 'partial'].includes(source.status))) return { fields, applied: [], stale: false };
  const next = { ...fields }, applied = [];
  for (const item of report.comparisons || []) {
    if (!hasVerifiedRegistryField(report, item.field) || item.sourceId !== 'fns' || item.status !== 'proposal' || !REGISTRY_REQUISITE_FIELDS.includes(item.field) || String(next[item.field] ?? '').trim() || typeof item.registry !== 'string' || !item.registry.trim()) continue;
    next[item.field] = item.registry;
    applied.push(item.field);
  }
  return { fields: applied.length ? next : fields, applied, stale: false };
}

export function applyRegistryChoice(fields, report, expectedFingerprint, field, choice) {
  if (!['original', 'registry'].includes(choice)) return null;
  if (verificationFingerprint(fields) !== expectedFingerprint) return null;
  if (!hasVerifiedRegistryField(report, field)) return null;
  const item = report?.comparisons?.find(row => row.field === field && row.sourceId === 'fns' && row.status === 'choice');
  if (!item) return null;
  const selected = resolveVerificationChoice(report, field, choice);
  return { ...fields, [selected.field]: selected.value };
}

export function registryConfirmationText(fields, report, fingerprint) {
  const current = verificationFingerprint(fields) === fingerprint;
  const source = current && report?.sources?.find(item => item.id === 'fns');
  if (!source || !['checked', 'partial'].includes(source.status)) return 'Проверка ФНС недоступна или ещё не завершена. Договор можно сформировать по реквизитам, выбранным администратором.';
  return `Доступные реквизиты сверены с ФНС. ${source.status === 'partial' ? 'Юридический адрес ФНС не подтверждён; он проверяется по документам клиента. ' : ''}При расхождении используются текущие реквизиты, пока администратор не выберет другое значение. Полномочия подписанта проверяются по документам. Арбитраж и ФССП ещё не подключены.`;
}

export function currentRegistryChoices(fields, fingerprint, choices = {}) {
  if (verificationFingerprint(fields) !== fingerprint) return {};
  return Object.fromEntries(Object.entries(choices).filter(([field, choice]) => REGISTRY_REQUISITE_FIELDS.includes(field) && ['original', 'registry'].includes(choice)));
}

export function currentRegistryVerification(fields, fingerprint, report, selections = {}) {
  const choices = currentRegistryChoices(fields, fingerprint, selections);
  const expectedRegistry = {};
  for (const field of Object.keys(choices)) {
    const row = report?.comparisons?.find(item => item.field === field && item.sourceId === 'fns');
    if (typeof row?.registry === 'string' && row.registry.length <= 2000 && row.registry.trim()) expectedRegistry[field] = row.registry;
  }
  return { choices, expectedRegistry };
}

export function canScheduleRegistryVerification({ configured, busy, alternativeRequired, fields, epoch, alive, lastAttempt, snapshot }) {
  const fingerprint = verificationFingerprint(fields);
  return Boolean(configured && !busy && !alternativeRequired && alive && validInn(fields.inn) && ['ip', 'ooo'].includes(fields.type) && (fields.type === 'ip' ? fields.inn.length === 12 : fields.inn.length === 10) && snapshot !== fingerprint && lastAttempt !== `${epoch}:${fingerprint}`);
}

export function serverRegistryAdvisory(value) {
  const report = value?.report;
  if (!report || !Array.isArray(report.sources)) return null;
  const decisions = value.decisions || [];
  return { ...report, comparisons: (report.comparisons || []).map(row => {
    const decision = decisions.find(item => item.field === row.field && item.status === 'confirmed' && item.choice === 'original');
    return decision ? { ...row, status: 'selected_original' } : row;
  }), warnings: [...(report.warnings || []), ...(value.warnings || [])] };
}

// Keep the newest server observation visible beside the saved document.
export function savedRegistryFeedback(id, message, ...observations) {
  const verification = observations.map(value => serverRegistryAdvisory(value?.verification || value?.job?.verification || value)).filter(Boolean).at(-1);
  const attention = verification && ((verification.warnings || []).length > 0 || (verification.comparisons || []).some(row => ['choice', 'conflict'].includes(row.status)) || (verification.sources || []).some(source => source.id === 'fns' && source.status !== 'checked'));
  return { id, kind: 'success', message: `${message}${attention ? ' Сверка ФНС содержит предупреждения или расхождения; подробности ниже.' : ''}`, ...(verification ? { verification } : {}) };
}
