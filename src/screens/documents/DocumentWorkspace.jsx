import DocumentSelect from './DocumentSelect.jsx';
import CounterpartyVerification from './CounterpartyVerification.jsx';
import { applyEmptyRegistryProposals, applyRegistryChoice, verificationFingerprint, canAutomaticallyVerify, canScheduleRegistryVerification, serverRegistryAdvisory, savedRegistryFeedback, registryConfirmationText, currentRegistryChoices, currentRegistryVerification } from '../../shared/contracts/verificationSnapshot.js';
import { loadStandaloneDocumentOptions } from '../../shared/contracts/standaloneOptions.js';
import { useEffect, useId, useRef, useState } from 'react';
import { fillSharedIpAddress } from '../../shared/contracts/ipAddress.js';
import { fillIpSignerFromCard, fillSignerNameGenitive, refreshSuggestedName } from '../../shared/contracts/ipSigner.js';
import { analyzeCounterparty } from '../../shared/contracts/requisiteChecks.js';
import { getDocumentAiSession } from '../../shared/contracts/documentAiSession.js';
import { isImportedContract, validateArchivedDocumentInput } from '../../shared/contracts/archivedDocuments.js';
import { guardDocumentSubmission } from '../../shared/contracts/documentPreflight.js';
import { canResumeDraftReview, canSaveDraftReview, draftReviewFingerprint, isFieldReviewConfirmed, isRelevantRequisiteField, recognitionAmbiguityGates, relevantRequisiteAttention, revokeFieldReviews } from '../../shared/contracts/reviewAcknowledgements.js';
import { fillSignerPositionGenitive } from '../../shared/contracts/signerPosition.js';
import { normalizeRussianPhone, formatRussianPhoneInput, russianPhoneCaret } from '../../shared/contracts/russianPhone.js';
import { hasSignedScan, filterSavedDocuments, SAVED_DOCUMENT_FOLDERS, savedDocumentsInFolder, unsignedGeneratedContractCount } from '../../shared/contracts/savedDocuments.js';
import { documentTrashActions } from '../../shared/contracts/documentTrash.js';
import { DOCUMENT_ATTACHMENT_CATEGORIES, canAttachDocumentFiles, validateDocumentAttachment } from '../../shared/contracts/documentAttachments.js';
import { automaticAiKey, blocksAutomaticAiSession, canAutomaticallyEnhanceCard, runAutomaticCardEnhancement, skippedAiMessage } from '../../shared/contracts/automaticAi.js';
import './DocumentWorkspace.css';

const FIELD_DEFINITIONS = [
  ['fullName', 'Полное наименование'], ['inn', 'ИНН'], ['kpp', 'КПП'],
  ['ogrn', 'ОГРН'], ['ogrnip', 'ОГРНИП'], ['legalAddress', 'Юридический адрес'],
  ['postalAddress', 'Почтовый адрес'], ['bankName', 'Банк'], ['bik', 'БИК'],
  ['settlementAccount', 'Расчётный счёт'], ['correspondentAccount', 'Корреспондентский счёт'],
  ['signerFullName', 'ФИО подписанта'], ['signerFullNameGenitive', 'ФИО подписанта в родительном падеже'], ['signerPosition', 'Должность подписанта'], ['signerPositionGenitive', 'Должность подписанта в родительном падеже'],
  ['authorityBasis', 'Основание полномочий'], ['phone', 'Телефон'], ['email', 'Контактные email'], ['edo', 'ЭДО'],
];
const EMPTY_FIELDS = Object.fromEntries([['type', ''], ...FIELD_DEFINITIONS.map(([key]) => [key, ''])]);
const STATUSES = { draft: 'Черновик', generated: 'Сформирован', sent: 'Отправлен', signing: 'На подписании', signed: 'Подписан', cancelled: 'Аннулирован', archived: 'Архив', purging: 'Удаление не завершено' };
const ACCEPT = '.pdf,.doc,.docx,.rtf,.xls,.xlsx,.jpg,.jpeg,.png';
const messageOf = (value) => typeof value === 'string' ? value : value?.message || value?.code || 'Требуется проверка';
const fileLabel = (file) => ({ original_scan: 'исходный договор', signed: 'подписанный договор' })[file.type || file.kind] || (file.type || file.kind || file.name || 'Файл').toUpperCase();
const matchesClientField = (issue, key) => issue.field === key || issue.field === `counterparty.${key}`;

function ContractDocuments({ document, canAttach, api, busy, perform, refresh, download, alive }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('addendum');
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const requestKey = useRef(null);
  const attachments = (document.files || []).filter(item => (item.type || item.kind) === 'attachment');
  const edit = (setter, value) => { setter(value); requestKey.current = null; setFeedback(null); };
  async function submit(event) {
    event.preventDefault();
    if (busy || !canAttach) return;
    const invalid = validateDocumentAttachment({ title, category, file });
    if (invalid) { setFeedback({ kind: 'error', message: invalid }); return; }
    requestKey.current ||= crypto.randomUUID();
    await perform('Сохраняем документ договора…', async () => {
      setFeedback({ kind: 'loading', message: 'Проверяем и сохраняем документ…' });
      try {
        await api.uploadDocumentAttachment(document.id, { file, title: title.trim(), category, idempotencyKey: requestKey.current });
        if (!alive.current) return;
        await refresh();
        if (!alive.current) return;
        setTitle(''); setFile(null); setFileKey(current => current + 1); requestKey.current = null;
        setFeedback({ kind: 'success', message: 'Документ добавлен в пакет договора.' });
      } catch (failure) {
        if (alive.current) setFeedback({ kind: 'error', message: failure.message || 'Не удалось добавить документ. Повторите попытку.' });
        throw failure;
      }
    });
  }
  if (!canAttach && attachments.length === 0) return null;
  return <details className="document-scan-details document-package"><summary>Документы договора{attachments.length ? ` (${attachments.length})` : ''}</summary>
    {attachments.length > 0 && <ul className="document-package-list">{attachments.map(item => <li key={item.id}><div><strong>{item.title || item.name || 'Документ'}</strong><span>{DOCUMENT_ATTACHMENT_CATEGORIES[item.category] || 'Другой документ'}{item.createdAt && ` · ${new Date(item.createdAt).toLocaleDateString('ru-RU')}`}</span></div><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => download(document, item)}>Скачать</button></li>)}</ul>}
    {canAttach && <form onSubmit={submit} className="document-package-form"><fieldset className="document-fieldset" disabled={Boolean(busy)}><legend>Добавить документ</legend><div className="document-grid"><label className="field">Тип документа<DocumentSelect value={category} onChange={event => edit(setCategory, event.target.value)} aria-label="Тип дополнительного документа">{Object.entries(DOCUMENT_ATTACHMENT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DocumentSelect></label><label className="field">Название документа<input value={title} maxLength={200} onChange={event => edit(setTitle, event.target.value)} /></label><label className="field">Файл<input key={fileKey} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => edit(setFile, event.target.files?.[0] || null)} /></label></div><div className="document-actions"><button type="submit" className="secondary-button">Добавить документ</button></div></fieldset></form>}
    {feedback && <p className={`document-message ${feedback.kind === 'error' ? 'document-message--error' : ''}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
  </details>;
}

export default function DocumentWorkspace(props) {
  // При смене клиента очищаются реквизиты и отменяется ожидание старых операций.
  const aiSession = getDocumentAiSession(props.api);
  return <Workspace key={`${props.standalone ? 'standalone' : props.clientId}:${aiSession.id}`} {...props} aiSession={aiSession} />;
}

function Workspace({ clientId, standalone = false, api, aiSession, capabilities = {}, title = 'Договоры', refreshToken = 0, view = 'all', onShowSaved }) {
  const archiveOnly = !standalone && !clientId;
  const id = useId();
  const alive = useRef(false);
  const controller = useRef(null);
  const operationLock = useRef(false);
  const requestKey = useRef(null);
  const [autoNameGenitive, setAutoNameGenitive] = useState(null);
  const [autoPositionGenitive, setAutoPositionGenitive] = useState(null);
  const [options, setOptions] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState('');
  const [paymentType, setPaymentType] = useState('prepayment');
  const [days, setDays] = useState('');
  const [card, setCard] = useState(null);
  const [cardAlternatives, setCardAlternatives] = useState([]);
  const [selectedAlternative, setSelectedAlternative] = useState('');
  const [aiConsent, setAiConsent] = useState(aiSession.read().mode);
  const [aiResult, setAiResult] = useState(null);
  const [aiNeed, setAiNeed] = useState(null);
  const [autoAiMode, setAutoAiMode] = useState(aiSession.read().mode);
  const [autoAiBlocked, setAutoAiBlocked] = useState(aiSession.read().blocked);
  const autoAiBlockedRef = useRef(aiSession.read().blocked);
  const attemptedAiKeys = useRef(new Set());
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [verificationReport, setVerificationReport] = useState(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const lastRegistryAttempt = useRef(null);
  const registryRequest = useRef(null);
  const [verificationChoices, setVerificationChoices] = useState({});
  const verificationSnapshot = useRef(null);
  const verificationEpoch = useRef(0);
  const pendingRegistryVerification = useRef(null);
  const [importId, setImportId] = useState(null);
  const [issues, setIssues] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [provenance, setProvenance] = useState({});
  const [manualChanges, setManualChanges] = useState({});
  const [reviewedFields, setReviewedFields] = useState({});
  const [savedDraftReviews, setSavedDraftReviews] = useState({});
  const savedDraftReviewsRef = useRef({});
  const [confirmed, setConfirmed] = useState(false);
  const [validation, setValidation] = useState(null);
  const [signedFiles, setSignedFiles] = useState({});
  const [savedInn, setSavedInn] = useState('');
  const [savedFolder, setSavedFolder] = useState('clients');
  const [trashView, setTrashView] = useState(false);
  const [trashedDocuments, setTrashedDocuments] = useState([]);
  const [pendingTrashId, setPendingTrashId] = useState(null);
  const [pendingPurgeId, setPendingPurgeId] = useState(null);
  const [archiveFeedback, setArchiveFeedback] = useState(null);
  const [historicOpen, setHistoricOpen] = useState(false);
  const [historicDraft, setHistoricDraft] = useState({ legalEntityId: '', number: '', fullName: '' });
  const [historicFile, setHistoricFile] = useState(null);
  const [historicError, setHistoricError] = useState('');
  const [historicNotice, setHistoricNotice] = useState('');
  const historicRequestKey = useRef(null);
  const [historicFileKey, setHistoricFileKey] = useState(0);
  const [generationFeedback, setGenerationFeedback] = useState(null);
  const savedDocuments = filterSavedDocuments(savedDocumentsInFolder(trashView ? trashedDocuments : documents, savedFolder), savedInn);
  const unsignedClientCount = unsignedGeneratedContractCount(documents);
  const archiveCapabilities = { delete: capabilities.delete ?? options?.capabilities?.delete ?? false, restore: capabilities.restore ?? options?.capabilities?.restore ?? false, purge: capabilities.purge ?? options?.capabilities?.purge ?? false };
  const canAttach = capabilities.attachDocuments ?? options?.capabilities?.attachDocuments ?? false;
  const canCreate = capabilities.create ?? options?.capabilities?.create ?? false;
  const canUploadSigned = capabilities.uploadSigned ?? options?.capabilities?.uploadSigned ?? false;
  const canImportArchived = options?.capabilities?.archiveImport === true && typeof api.importArchivedDocument === 'function';
  const blockers = options?.blockers || [];
  const invalidDays = paymentType === 'postpayment' && (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days)) || Number(days) < 1 || Number(days) > 9999);
  const checks = analyzeCounterparty(fields, { provenance, warnings, manualChanges });
  const visibleCheck = key => isRelevantRequisiteField(fields.type, key);
  const checkByField = Object.fromEntries((checks.fields || []).map(item => [item.field, item]));
  const attention = relevantRequisiteAttention(fields, checks);
  const pendingReview = attention.filter(item => item.status === 'needs_review' && !isFieldReviewConfirmed(fields, reviewedFields, item.field));
  const hasRequiredErrors = (checks.errors || []).length > 0 || attention.some(item => item.status === 'needs_input');
  const creationBlocked = hasRequiredErrors || pendingReview.length > 0;
  const draftReviewBlocked = !canSaveDraftReview(fields, checks, reviewedFields);
  const alternativeRequired = cardAlternatives.length > 1 && !selectedAlternative;
  const aiAvailable = options?.ai?.available === true && options?.ai?.provider === 'openai';
  const verificationConfigured = options?.verification?.configured === true && typeof api.verifyCounterparty === 'function';
  const registryConfirmation = registryConfirmationText(fields, verificationReport, verificationSnapshot.current);
  const onlyWhenNeeded = options?.ai?.onlyWhenNeeded === true;
  const hasManualChanges = Object.values(manualChanges).some(Boolean);
  const creationBusy = ['Проверяем условия и шаблон…', 'Сохраняем договор…', 'Формируем DOCX и PDF…'].includes(busy);
  const checkedCount = (checks.fields || []).filter(item => visibleCheck(item.field) && item.status === 'checked').length;

  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    controller.current = abort;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const nextOptions = await (standalone ? loadStandaloneDocumentOptions(api) : archiveOnly ? api.getArchiveDocumentOptions() : api.getDocumentOptions(clientId));
        if (cancelled) return;
        setOptions(nextOptions);
        if (nextOptions.ai && !aiSession.read().initialized) {
          const authorizedAuto = nextOptions.ai?.autoRecognition === true;
          aiSession.initialize(authorizedAuto);
          setAutoAiMode(authorizedAuto); setAiConsent(authorizedAuto);
        }
        setSupplier(current => (nextOptions.legalEntities || []).some(entity => entity.id === current) ? current : '');
        setConfirmed(false);
        setValidation(null);
        requestKey.current = null;
        if (nextOptions.enabled !== false) {
          const list = await (api.listSavedDocuments ? api.listSavedDocuments() : api.listDocuments(clientId));
          if (!cancelled) setDocuments(list.documents || []);
        }
      } catch (failure) {
        if (!cancelled) setError(failure.message || 'Не удалось загрузить документы. Повторите попытку.');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; alive.current = false; abort.abort(); };
  }, [api, clientId, refreshToken, aiSession, archiveOnly, standalone]);

  async function refresh() {
    const result = await (api.listSavedDocuments ? api.listSavedDocuments() : api.listDocuments(clientId));
    if (alive.current) setDocuments(result.documents || []);
  }

  function invalidate() {
    verificationEpoch.current += 1;
    pendingRegistryVerification.current = null;
    verificationSnapshot.current = null;
    setVerificationReport(null);
    setVerificationChoices({});
    setConfirmed(false);
    setValidation(null);
    setNotice('');
    setError('');
    requestKey.current = null;
  }

  async function perform(label, task) {
    if (operationLock.current) return;
    operationLock.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try { await task(); }
    catch (failure) {
      if (alive.current && failure.name !== 'AbortError') {
        setError(failure.message || 'Не удалось выполнить действие. Попробуйте ещё раз.');
        const errors = failure.payload?.errors || failure.payload?.validation?.errors;
        if (Array.isArray(errors)) setValidation({ valid: false, errors, warnings: failure.payload?.warnings || [] });
      }
    }
    finally {
      operationLock.current = false;
      if (alive.current) setBusy('');
    }
  }

  async function waitForResult(initial, fetchResult) {
    let result = initial;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (!alive.current || controller.current.signal.aborted) throw new DOMException('Ожидание отменено', 'AbortError');
      if (!['running', 'pending', 'queued', 'processing'].includes(result.status)) return result;
      await new Promise((resolve, reject) => {
        const signal = controller.current.signal;
        const abort = () => { clearTimeout(timer); reject(new DOMException('Ожидание отменено', 'AbortError')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
        signal.addEventListener('abort', abort, { once: true });
      });
      result = await fetchResult(result.id);
    }
    throw new Error('Обработка продолжается. Обновите список позже; повторное создание не требуется.');
  }

  function payload() {
    requestKey.current ||= crypto.randomUUID();
    return { legalEntityId: supplier, date, payment: { type: paymentType, days: paymentType === 'postpayment' ? Number(days) : null }, counterparty: fields, verification: currentRegistryVerification(fields, verificationSnapshot.current, verificationReport, verificationChoices), confirmed, importId, idempotencyKey: requestKey.current };
  }

  async function recognize() {
    await perform('Распознаём карточку…', async () => {
      setAiConsent(autoAiMode); setAiResult(null);
      const initial = await (standalone ? api.importStandaloneDocumentCard(card) : api.importDocumentCard(clientId, card));
      const result = await waitForResult(initial.import || initial, (jobId) => api.getDocumentImport(jobId));
      if (!alive.current) return;
      if (result.status === 'failed') throw new Error(messageOf(result.error || 'Карточку не удалось распознать. Введите реквизиты вручную.'));
      const recognized = result.fields ? result : { ...result, ...result.result };
      if (Array.isArray(recognized.alternatives) && recognized.alternatives.length > 1) {
        setCardAlternatives(recognized.alternatives); setSelectedAlternative('');
        resetRecognizedFields(); setImportId(result.id); invalidate();
        setNotice('В файле несколько карточек клиента. Выберите нужный лист — реквизиты разных организаций не объединяются.');
        return;
      }
      setCardAlternatives([]); setSelectedAlternative('');
      applyRecognizedCard(recognized, result.id);
      await automaticallyEnhance(result.id, '', { manualChanges: {}, aiNeed: recognized.aiNeed });
    });
  }

  async function refreshTrash() {
    const result = await api.listTrashedDocuments();
    if (alive.current) setTrashedDocuments(result.documents || []);
  }

  function editHistoric(key, value) {
    setHistoricDraft(current => ({ ...current, [key]: value }));
    setHistoricError(''); setHistoricNotice(''); historicRequestKey.current = null;
  }

  function openHistoricImport() {
    setHistoricDraft({ legalEntityId: supplier, number: '', fullName: fields.fullName.trim() });
    setHistoricFile(null); setHistoricFileKey(current => current + 1);
    setHistoricError(''); setHistoricNotice(''); historicRequestKey.current = null; setHistoricOpen(true);
  }

  async function importHistoric(event) {
    event.preventDefault();
    if (!canImportArchived || busy) return;
    const errors = validateArchivedDocumentInput({ draft: historicDraft, file: historicFile });
    if (errors.length) { setHistoricError(errors[0]); return; }
    await perform('Сохраняем старый договор…', async () => {
      setHistoricError(''); setHistoricNotice('');
      try {
        historicRequestKey.current ||= crypto.randomUUID();
        await api.importArchivedDocument({ folder: savedFolder, legalEntityId: historicDraft.legalEntityId, number: historicDraft.number.trim(), counterparty: { fullName: historicDraft.fullName.trim() }, file: historicFile, idempotencyKey: historicRequestKey.current });
        if (!alive.current) return;
        setHistoricFile(null); setHistoricFileKey(current => current + 1);
        setHistoricNotice('Подписанный договор сохранён в архиве.');
        setSavedInn(historicDraft.fullName.trim());
        try { await refresh(); } catch { if (alive.current) setHistoricNotice('Договор сохранён. Для обновления архива нажмите «Обновить список».'); }
      } catch (failure) {
        if (alive.current) setHistoricError(failure.message || 'Не удалось загрузить договор. Повторите попытку.');
        throw failure;
      }
    });
  }

  async function toggleTrash() {
    if (!archiveCapabilities.restore) return;
    await perform('Загружаем договоры…', async () => {
      if (!trashView) await refreshTrash(); else await refresh();
      if (!alive.current) return;
      setTrashView(!trashView); setPendingTrashId(null); setArchiveFeedback(null);
    });
  }

  async function changeTrash(document, restore = false) {
    const permitted = documentTrashActions(document, archiveCapabilities, trashView);
    if (restore ? !permitted.restore : !permitted.trash || pendingTrashId !== document.id) return;
    const message = restore ? 'Восстанавливаем договор…' : 'Перемещаем договор в корзину…';
    await perform(message, async () => {
      setArchiveFeedback({ id: document.id, kind: 'loading', message });
      try {
        if (restore) await api.restoreDocument(document.id); else await api.trashDocument(document.id);
        if (!alive.current) return;
        // Remove only after the server acknowledges the reversible operation.
        if (restore) setTrashedDocuments(current => current.filter(item => item.id !== document.id));
        else setDocuments(current => current.filter(item => item.id !== document.id));
        setPendingTrashId(null);
        setArchiveFeedback({ id: document.id, kind: 'success', message: restore ? 'Договор восстановлен в сохранённые договоры.' : 'Договор перемещён в корзину. Его можно восстановить.' });
        try { await refresh(); if (trashView) await refreshTrash(); }
        catch { if (alive.current) setArchiveFeedback({ id: document.id, kind: 'success', message: 'Изменение сохранено. Для обновления списка нажмите «Обновить список».' }); }
      } catch (failure) {
        if (alive.current) setArchiveFeedback({ id: document.id, kind: 'error', message: failure.message || 'Не удалось изменить состояние договора. Повторите попытку.' });
        throw failure;
      }
    });
  }

  function resetRecognizedFields() {
    setAiNeed(null);
    setFields({ ...EMPTY_FIELDS }); setAutoNameGenitive(null); setAutoPositionGenitive(null);
    setIssues([]); setWarnings([]); setProvenance({}); setManualChanges({}); setReviewedFields({});
  }

  function applyRecognizedCard(result, nextImportId) {
      setAiNeed(result.aiNeed || null);
      const recognized = fillSharedIpAddress(result);
      const extracted = recognized.fields || {};
      const gates = recognitionAmbiguityGates(recognized.warnings || []);
      const extractedFields = { ...EMPTY_FIELDS, ...Object.fromEntries(Object.keys(EMPTY_FIELDS).map((key) => [key, String(extracted[key] ?? '')])) };
      const ipFields = gates.ipSigner ? fillIpSignerFromCard(extractedFields) : extractedFields;
      if (!gates.signerName) ipFields.signerFullNameGenitive = extractedFields.signerFullNameGenitive;
      const name = gates.signerName ? fillSignerNameGenitive(ipFields) : { fields: ipFields, autoValue: null };
      const next = gates.signerPosition ? fillSignerPositionGenitive(name.fields) : { fields: name.fields, autoValue: null };
      next.fields.phone = normalizeRussianPhone(next.fields.phone) ?? next.fields.phone;
      const positionSource = recognized.provenance?.signerPositionGenitive;
      setAutoPositionGenitive(positionSource?.rule || positionSource?.derivedFrom === 'signerPosition' ? next.fields.signerPositionGenitive || '' : next.autoValue);
      const nameSource = recognized.provenance?.signerFullNameGenitive;
      setAutoNameGenitive(gates.signerName && (nameSource?.rule || nameSource?.derivedFrom === 'signerFullName' || !extracted.signerFullNameGenitive) ? next.fields.signerFullNameGenitive || '' : null);
      setFields(next.fields);
      setImportId(nextImportId);
      setIssues(result.issues || []);
      setWarnings(recognized.warnings || []);
      setProvenance(recognized.provenance || {});
      setManualChanges({});
      setReviewedFields({});
      invalidate();
      pendingRegistryVerification.current = { epoch: verificationEpoch.current, fingerprint: verificationFingerprint(next.fields) };
      setNotice('Карточка распознана. Автоматическая проверка выделила поля, которые нужно уточнить.');
  }

  async function enhanceWithAi() {
    if (hasManualChanges) {
      setError('Поля уже исправлены вручную. Для уточнения с ИИ сначала повторно распознайте карточку локально. Это заменит текущие исправления.');
      return;
    }
    if ((onlyWhenNeeded && aiNeed?.needed !== true) || !aiAvailable || !aiConsent || !card || !importId || alternativeRequired || busy) return;
    await perform('Уточняем реквизиты с ИИ…', async () => {
      await applyAiEnhancement(importId, selectedAlternative);
    });
  }

  async function automaticallyEnhance(nextImportId, sheetId = '', overrides = {}) {
    const args = { mode: autoAiMode, consent: aiConsent || autoAiMode, available: aiAvailable, onlyWhenNeeded, aiNeed, importId: nextImportId, sheetId, manualChanges, blocked: autoAiBlockedRef.current, attemptedKeys: attemptedAiKeys.current, ...overrides };
    if (!canAutomaticallyEnhanceCard(args)) {
      if ((!args.onlyWhenNeeded || args.aiNeed?.needed === true) && args.mode && (!args.available || args.blocked) && alive.current) setAiResult({ status: 'fallback', provider: 'disabled', message: args.blocked ? 'Автоматические запросы ИИ приостановлены. Локальное распознавание и создание договоров работают; повторить запрос можно кнопкой «Уточнить с ИИ».' : 'ИИ не настроен. Используется локальное распознавание; договор можно создать без ИИ.' });
      return;
    }
    await runAutomaticCardEnhancement(args, async () => {
      setBusy('Уточняем реквизиты с ИИ…');
      await applyAiEnhancement(nextImportId, sheetId);
    });
  }

  async function applyAiEnhancement(nextImportId, sheetId = '') {
    attemptedAiKeys.current.add(automaticAiKey(nextImportId, sheetId));
    try {
      const result = await api.enhanceDocumentImport(nextImportId, { consent: true, ...(sheetId ? { sheetId } : {}) });
      if (!alive.current) return;
      if (result.ai?.status === 'skipped') {
        setAiNeed(result.aiNeed || { needed: false });
        setAiResult({ ...result.ai, message: skippedAiMessage(result.aiNeed) });
        return;
      }
      if (result.status !== 'succeeded' || !result.fields || typeof result.fields !== 'object' || Array.isArray(result.fields) || !['succeeded', 'fallback'].includes(result.ai?.status) || (result.ai.status === 'succeeded' && result.ai.provider !== 'openai')) throw new Error('ИИ не вернул подтверждённый результат. Локальные данные сохранены.');
      if (result.ai.status === 'fallback') {
        const failureMessage = messageOf(result.warnings?.find(item => !item.field && item.code === result.ai.code) || 'Уточнение с ИИ не выполнено. Сохранён результат локального распознавания.');
        setAiResult({ ...result.ai, message: failureMessage });
        if (blocksAutomaticAiSession(result.ai.code)) { aiSession.setBlocked(true); autoAiBlockedRef.current = true; setAutoAiBlocked(true); }
        return;
      }
      applyRecognizedCard(result, nextImportId);
      aiSession.setBlocked(false); autoAiBlockedRef.current = false; setAutoAiBlocked(false);
      setAiResult(result.ai);
      setNotice('ИИ обработал текст карточки. Дополненные реквизиты проверены по локальным правилам; неоднозначные значения подсвечены.');
    } catch (failure) {
      if (!alive.current) return;
      const code = failure.payload?.code || failure.code;
      if (blocksAutomaticAiSession(code)) { aiSession.setBlocked(true); autoAiBlockedRef.current = true; setAutoAiBlocked(true); }
      setAiResult({ status: 'fallback', provider: 'disabled', code, message: 'Уточнение с ИИ не выполнено. Локальные реквизиты сохранены; договор можно создать без ИИ.' });
    }
  }

  async function check() {
    if (alternativeRequired) { setError('Выберите лист с карточкой клиента перед проверкой.'); return; }
    await perform('Проверяем данные…', async () => {
      const result = await (standalone ? api.validateStandaloneDocumentDraft(payload()) : api.validateDocumentDraft(clientId, payload()));
      if (!alive.current) return;
      setValidation(result);
      if (result.valid) setNotice('Данные прошли проверку. Для формирования требуется утверждённый шаблон и настроенная конвертация PDF.');
    });
  }

  function changeField(key, value) {
    let nextFields = { ...fields, [key]: key === 'phone' ? formatRussianPhoneInput(value) : value };
    if (key === 'signerFullName') {
      const next = autoNameGenitive === null ? fillSignerNameGenitive(nextFields) : refreshSuggestedName(nextFields, autoNameGenitive);
      nextFields = next.fields;
      setAutoNameGenitive(next.autoValue);
    } else if (key === 'signerFullNameGenitive') {
      setAutoNameGenitive(null);
    }
    if (key === 'signerPosition') {
      const next = fillSignerPositionGenitive(nextFields, autoPositionGenitive);
      nextFields = next.fields;
      setAutoPositionGenitive(next.autoValue);
    } else if (key === 'signerPositionGenitive') {
      setAutoPositionGenitive(null);
    }
    setFields(nextFields);
    setManualChanges((current) => ({ ...current, [key]: true }));
    setReviewedFields(current => revokeFieldReviews(current, key));
    invalidate();
  }

  async function create(event, generate = true) {
    event?.preventDefault();
    if (!canCreate || busy) return;
    verificationEpoch.current += 1; pendingRegistryVerification.current = null; registryRequest.current = null; setVerificationBusy(false);
    const submission = guardDocumentSubmission({ fields, provenance, warnings, manualChanges, reviews: reviewedFields, supplier, date, paymentType, days, confirmed, alternativeRequired, generate }, () => perform(generate ? 'Проверяем условия и шаблон…' : 'Сохраняем черновик…', async () => {
      const draft = payload();
      if (generate) {
        const result = await (standalone ? api.validateStandaloneDocumentDraft(draft) : api.validateDocumentDraft(clientId, draft));
        if (!alive.current) return;
        setValidation(result);
        if (!result.valid) {
          setError(messageOf(result.errors?.[0] || 'Серверная проверка обнаружила ошибки.'));
          requestAnimationFrame(() => { if (alive.current) focusField(String(result.errors?.[0]?.field || '').replace(/^counterparty\./u, '')); });
          return;
        }
      }
      setBusy('Сохраняем договор…');
      const created = await (standalone ? api.createStandaloneDocumentDraft(draft) : api.createDocumentDraft(clientId, draft));
      if (!alive.current) return;
      const document = created.document || created;
      showServerVerification(created.verification, draft.counterparty);
      await refresh();
      if (!alive.current) return;
      if (!generate || blockers.length) {
        setGenerationFeedback(savedRegistryFeedback(document.id, 'Черновик договора сохранён.', created));
        setNotice(blockers.length && generate ? 'Черновик сохранён. Формирование файлов недоступно: устраните перечисленные ограничения конфигурации.' : 'Черновик договора сохранён.');
        setSavedInn(''); setSavedFolder('clients'); setTrashView(false); onShowSaved?.();
        return;
      }
      setBusy('Формируем DOCX и PDF…');
      const generation = await api.generateDocument(document.id);
      showServerVerification(generation.verification || generation.job?.verification, draft.counterparty);
      const completed = await waitForResult(generation.job || generation, (jobId) => api.getDocumentJob(jobId));
      if (!alive.current) return;
      await refresh();
      if (completed.status === 'failed') throw new Error(messageOf(completed.error || 'Не удалось сформировать файлы. Черновик сохранён.'));
      if (completed.status !== 'succeeded') throw new Error('Формирование не завершено. Проверьте состояние сохранённого договора.');
      setGenerationFeedback(savedRegistryFeedback(document.id, 'Договор сформирован. DOCX и PDF доступны для скачивания.', created, generation, completed));
      setNotice('Договор сформирован. DOCX и PDF доступны в списке документов.');
      setSavedInn(''); setSavedFolder('clients'); setTrashView(false); onShowSaved?.();
    }));
    if (!submission.preflight.valid) {
      setNotice('');
      setValidation({ ...submission.preflight, local: true });
      setError(submission.preflight.errors[0].message);
      focusField(submission.preflight.firstField);
      return;
    }
    await submission.pending;
  }

  async function download(document, file) {
    await perform('Подготавливаем скачивание…', async () => {
      const result = await api.downloadDocumentFile(document.id, file.id);
      if (!alive.current) return;
      const blob = result instanceof Blob ? result : result.blob;
      if (!(blob instanceof Blob)) throw new Error('Сервер не вернул файл.');
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName || file.name || `Договор-${document.number || document.id}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function uploadSigned(document) {
    await perform('Сохраняем подписанный экземпляр…', async () => {
      await api.uploadSignedDocument(document.id, signedFiles[document.id]);
      if (!alive.current) return;
      await refresh();
      setNotice('Подписанный экземпляр сохранён.');
      setSignedFiles((current) => ({ ...current, [document.id]: null }));
    });
  }

  async function resumeGeneration(document) {
    await perform('Формируем файлы сохранённого договора…', async () => {
      setGenerationFeedback({ id: document.id, kind: 'loading', message: 'Проверяем сохранённый черновик…' });
      try {
      if (blockers.length) throw new Error('Формирование недоступно: устраните перечисленные ограничения конфигурации.');
      const snapshot = await api.getDocumentDraftReview(document.id);
      if (!alive.current) return;
      const fingerprint = draftReviewFingerprint(snapshot);
      const previous = savedDraftReviewsRef.current[document.id];
      const reviews = previous?.fingerprint === fingerprint ? previous.reviews : {};
      saveDraftReview(document.id, { snapshot, fingerprint, reviews });
      if (!canResumeDraftReview(snapshot, reviews)) {
        setGenerationFeedback({ id: document.id, kind: 'review', message: 'Уточните данные в проверке этого черновика ниже.' });
        setNotice('Сохранённый черновик проверен. Уточните выделенные данные или подтвердите их в карточке договора.');
        return;
      }
      setGenerationFeedback({ id: document.id, kind: 'loading', message: 'Формируем DOCX и PDF…' });
      const result = await api.generateDocument(document.id);
      const advisory = serverRegistryAdvisory(result.verification || result.job?.verification);
      if (advisory) setGenerationFeedback({ id: document.id, kind: 'loading', message: 'Формируем DOCX и PDF. Сверка ФНС выполнена без изменения выбранных реквизитов.', verification: advisory });
      const completed = await waitForResult(result.job || result, (jobId) => api.getDocumentJob(jobId));
      if (!alive.current) return;
      await refresh();
      if (completed.status !== 'succeeded') throw new Error(messageOf(completed.error || 'Формирование не завершено. Черновик сохранён.'));
      setNotice('DOCX и PDF сохранённого договора сформированы.');
      setGenerationFeedback(savedRegistryFeedback(document.id, 'DOCX и PDF сформированы. Файлы доступны для скачивания.', result, completed));
      } catch (failure) {
        if (alive.current) setGenerationFeedback({ id: document.id, kind: 'error', message: failure.message || 'Не удалось сформировать файлы. Черновик сохранён.' });
        throw failure;
      }
    });
  }

  function showServerVerification(value, submittedFields) {
    const report = serverRegistryAdvisory(value);
    if (!report || !alive.current) return;
    verificationSnapshot.current = verificationFingerprint(submittedFields);
    setVerificationReport(report);
  }

  async function verifyExternal() {
    if (!verificationConfigured || busy || alternativeRequired) return;
    const snapshot = verificationFingerprint(fields);
    const epoch = verificationEpoch.current;
    const key = `${epoch}:${snapshot}`;
    if (registryRequest.current === key) return;
    registryRequest.current = key;
    lastRegistryAttempt.current = key;
    setVerificationBusy(true);
    try {
      const result = await api.verifyCounterparty({ ...fields });
      if (!alive.current || verificationEpoch.current !== epoch) return;
      const report = result.report || result;
      const proposed = applyEmptyRegistryProposals(fields, report, snapshot);
      if (proposed.stale) return;
      if (proposed.applied.length) { setFields(proposed.fields); invalidate(); }
      verificationSnapshot.current = verificationFingerprint(proposed.fields);
      setVerificationChoices({});
      setVerificationReport(report);
    } catch {
      if (alive.current && verificationEpoch.current === epoch) {
        verificationSnapshot.current = snapshot;
        setVerificationReport({ sources: [{ id: 'fns', status: 'unavailable' }], comparisons: [], warnings: [{ message: 'Проверка ФНС недоступна. Договор можно сформировать по реквизитам, выбранным администратором.' }] });
      }
    } finally {
      if (registryRequest.current === key) { registryRequest.current = null; if (alive.current) setVerificationBusy(false); }
    }
  }

  useEffect(() => {
    const args = { configured: verificationConfigured, busy, alternativeRequired, fields, epoch: verificationEpoch.current, alive: alive.current, lastAttempt: lastRegistryAttempt.current, snapshot: verificationSnapshot.current };
    if (!canScheduleRegistryVerification(args)) return;
    const recognized = canAutomaticallyVerify(pendingRegistryVerification.current, args);
    const timer = setTimeout(() => {
      pendingRegistryVerification.current = null;
      void verifyExternal();
    }, recognized ? 0 : 700);
    return () => clearTimeout(timer);
  });

  function chooseVerifiedField(field, choice) {
    if (busy) return;
    const next = applyRegistryChoice(fields, verificationReport, verificationSnapshot.current, field, choice);
    if (!next) return;
    const report = verificationReport;
    const nextChoices = { ...currentRegistryChoices(fields, verificationSnapshot.current, verificationChoices), [field]: choice };
    setFields(next);
    setManualChanges(current => ({ ...current, [field]: true }));
    setReviewedFields(current => revokeFieldReviews(current, field));
    invalidate();
    verificationSnapshot.current = verificationFingerprint(next);
    setVerificationChoices(nextChoices);
    setVerificationReport({ ...report, comparisons: report.comparisons.map(item => item.field === field ? { ...item, status: choice === 'registry' ? 'match' : 'selected_original' } : item) });
  }

  async function purge(document) {
    if (!trashView || !archiveCapabilities.purge || document.canPurge !== true) return;
    await perform('Удаляем пакет договора…', async () => {
      setArchiveFeedback({ id: document.id, kind: 'loading', message: 'Удаляем договор и его документы…' });
      try {
        await api.purgeDocument(document.id);
        if (!alive.current) return;
        setTrashedDocuments(current => current.filter(item => item.id !== document.id));
        setPendingPurgeId(null);
        setArchiveFeedback({ kind: 'success', message: 'Договор и его документы удалены навсегда. Номер повторно не используется.' });
      } catch (failure) {
        if (alive.current) setArchiveFeedback({ id: document.id, kind: 'error', message: failure.message || 'Не удалось удалить пакет договора.' });
        throw failure;
      }
    });
  }

  function saveDraftReview(documentId, value) {
    const next = { ...savedDraftReviewsRef.current, [documentId]: value };
    savedDraftReviewsRef.current = next;
    setSavedDraftReviews(next);
  }

  function correctDraftInForm(snapshot) {
    if (String(snapshot.clientId ?? '') !== String((standalone ? null : options?.clientId ?? clientId) ?? '')) {
      setError('Для исправления откройте карточку клиента, которому принадлежит этот договор.');
      return;
    }
    setFields({ ...EMPTY_FIELDS, ...snapshot.counterparty });
    setSupplier(snapshot.entityId); setDate(snapshot.date || '');
    setPaymentType(snapshot.payment?.type || 'prepayment');
    setDays(snapshot.payment?.days == null ? '' : String(snapshot.payment.days));
    setImportId(null); setCard(null); setProvenance({}); setWarnings([]); setIssues([]);
    setCardAlternatives([]); setSelectedAlternative('');
    setAiConsent(false); setAiResult(null); setAiNeed(null);
    setManualChanges({}); setReviewedFields({}); setAutoNameGenitive(null); setAutoPositionGenitive(null);
    invalidate();
    setNotice('Данные черновика перенесены в форму для исправления. После создания появится новый договор; сохранённый черновик останется без изменений.');
    focusField('signerFullName');
  }

  const validationErrors = validation?.errors || [];
  function fieldHints(key) {
    const currentCheck = checkByField[key];
    const fieldIssues = [...issues.filter(item => currentCheck?.status === 'needs_input' && !manualChanges[item.field]), ...validationErrors].filter((item) => matchesClientField(item, key));
    if (currentCheck && ['needs_input', 'needs_review'].includes(currentCheck.status)) fieldIssues.push(currentCheck);
    return { fieldIssues };
  }
  function focusField(key) { document.getElementById(`${id}-${key === 'card-alternative' ? key : `${key}-input`}`)?.focus(); }
  function focusFirstAttention(includeMissing = true) {
    const first = attention.find(item => (includeMissing && item.status === 'needs_input') || (item.status === 'needs_review' && !isFieldReviewConfirmed(fields, reviewedFields, item.field)));
    if (first) focusField(first.field);
  }
  function inlineFieldReview(key) {
    if (checkByField[key]?.status !== 'needs_review' || !String(fields[key] || '').trim()) return null;
    return <label className="document-review-confirm"><input type="checkbox" checked={isFieldReviewConfirmed(fields, reviewedFields, key)} onChange={event => {
      setReviewedFields(current => { const next = { ...current }; if (event.target.checked) next[key] = fields[key]; else delete next[key]; return next; });
      invalidate();
    }} />Проверил по документам, подтверждаю указанное значение.</label>;
  }
  function draftReviewPane(document) {
    const entry = savedDraftReviews[document.id];
    if (!entry) return null;
    const { snapshot, reviews } = entry;
    const items = relevantRequisiteAttention(snapshot.counterparty, snapshot.checks);
    const errors = snapshot.validation?.errors || [];
    const labelOf = field => field === 'type' ? 'Тип клиента' : FIELD_DEFINITIONS.find(([key]) => key === field)?.[1] || field;
    const sameClient = String(snapshot.clientId ?? '') === String((standalone ? null : options?.clientId ?? clientId) ?? '');
    return <fieldset disabled={Boolean(busy)} className="document-fieldset document-draft-review"><legend>Проверка сохранённого черновика</legend>
      {errors.length > 0 && <ul className="document-message document-message--error">{errors.map((item, index) => <li key={index}>{item.field ? `${labelOf(String(item.field).replace(/^counterparty\./u, ''))}: ` : ''}{messageOf(item)}</li>)}</ul>}
      {items.length > 0 && <ul className="document-attention-list">{items.map(item => <li key={item.field}><strong>{labelOf(item.field)}</strong><p>{item.message}</p><p className="document-hint">Значение: {String(snapshot.counterparty[item.field] || 'не указано')}</p>
        {item.status === 'needs_review' && String(snapshot.counterparty[item.field] || '').trim() && <label className="document-review-confirm"><input type="checkbox" checked={isFieldReviewConfirmed(snapshot.counterparty, reviews, item.field)} onChange={event => {
          const nextReviews = { ...reviews };
          if (event.target.checked) nextReviews[item.field] = snapshot.counterparty[item.field]; else delete nextReviews[item.field];
          saveDraftReview(document.id, { ...entry, reviews: nextReviews });
        }} />Проверил по документам, подтверждаю сохранённое значение.</label>}
      </li>)}</ul>}
      {canResumeDraftReview(snapshot, reviews) ? <p className="document-hint">Уточнения подтверждены. Нажмите «Сформировать DOCX + PDF».</p> : <p className="document-hint">До формирования исправьте обязательные поля и подтвердите неоднозначные значения. Исправление выполняется через новый договор.</p>}
      {sameClient ? <button type="button" className="secondary-button" onClick={() => correctDraftInForm(snapshot)}>Исправить в форме</button> : <p className="document-hint">Для исправления откройте карточку клиента этого договора.</p>}
    </fieldset>;
  }
  return <section className="panel document-workspace" aria-busy={loading || Boolean(busy)}>
    <div className="panel-heading"><div><p className="eyebrow">{standalone ? 'Генератор договоров' : archiveOnly ? 'Архив договоров' : 'Документы клиента'}</p><h2>{title}</h2>{!archiveOnly && <p>Выберите поставщика и оплату, проверьте реквизиты клиента и получите DOCX и PDF.</p>}</div></div>
    {view === 'all' && <nav aria-label="Разделы договоров"><a className="secondary-button document-archive-link" href={`#${id}-saved-contracts`}>Сохранённые договоры</a></nav>}
    {loading && <p role="status">Загружаем документы…</p>}
    {error && <div className="document-message document-message--error" role="alert">{error}</div>}
    {notice && <div className="document-message" role="status">{notice}</div>}
    {busy && !creationBusy && <p role="status">{busy}</p>}
    {!loading && !options && <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => perform('Загружаем документы…', async () => {
      const next = await (standalone ? loadStandaloneDocumentOptions(api) : archiveOnly ? api.getArchiveDocumentOptions() : api.getDocumentOptions(clientId));
      if (alive.current) {
        setOptions(next);
        if (next.ai && !aiSession.read().initialized) {
          const authorizedAuto = next.ai?.autoRecognition === true;
          aiSession.initialize(authorizedAuto);
          setAutoAiMode(authorizedAuto); setAiConsent(authorizedAuto);
        }
      }
      if (next.enabled !== false) await refresh();
    })}>Повторить загрузку</button>}
    {!loading && options && <>
      {blockers.length > 0 && <div className="document-message document-message--warning"><strong>Формирование пока недоступно</strong><ul>{blockers.map((item, index) => <li key={index}>{messageOf(item)}</li>)}</ul><p>Реквизиты можно проверить. Готовые файлы появятся после настройки утверждённых шаблонов.</p></div>}
      <div hidden={view === 'archive'}>
      {canCreate ? <form onSubmit={create} noValidate>
        <fieldset disabled={Boolean(busy)} className="document-fieldset"><legend>1. Поставщик и оплата</legend>
          <div className="document-grid">
            <label className="field">Наше юрлицо<DocumentSelect aria-label="Наше юрлицо" id={`${id}-legalEntityId-input`} required value={supplier} onChange={(event) => { setSupplier(event.target.value); invalidate(); }}><option value="">Выберите юрлицо</option>{(options.legalEntities || []).map((entity) => <option value={entity.id} key={entity.id}>{entity.name}</option>)}</DocumentSelect></label>
            <label className="field">Дата договора<input id={`${id}-date-input`} type="date" required value={date} onChange={(event) => { setDate(event.target.value); invalidate(); }} /></label>
            <label className="field">Условия оплаты<DocumentSelect aria-label="Условия оплаты" id={`${id}-paymentType-input`} value={paymentType} onChange={(event) => { setPaymentType(event.target.value); invalidate(); }}><option value="prepayment">100% предоплата</option><option value="postpayment">Постоплата</option></DocumentSelect></label>
            {paymentType === 'postpayment' && <label className="field">Количество календарных дней<input id={`${id}-days-input`} inputMode="numeric" type="number" min="1" max="9999" step="1" required value={days} aria-invalid={invalidDays && days !== ''} onChange={(event) => { setDays(event.target.value); invalidate(); }} /></label>}
          </div>
        </fieldset>
        <fieldset disabled={Boolean(busy)} className="document-fieldset"><legend>2. Карточка клиента</legend>
          <label className="field">Загрузить карточку<input type="file" accept={ACCEPT} onChange={(event) => { setCard(event.target.files?.[0] || null); setCardAlternatives([]); setSelectedAlternative(''); setAiConsent(autoAiMode); setAiResult(null); setImportId(null); resetRecognizedFields(); invalidate(); }} /></label>
          <button className="secondary-button document-recognize-button" type="button" disabled={!card} onClick={recognize}>Распознать карточку</button>
          {busy === 'Уточняем реквизиты с ИИ…' && <p className="document-message" role="status">Локальные реквизиты распознаны. Уточняем их с ИИ…</p>}
          {cardAlternatives.length > 1 && <label className="field document-card-alternative">Выберите лист с карточкой клиента<DocumentSelect aria-label="Выберите лист с карточкой клиента" id={`${id}-card-alternative`} value={selectedAlternative} onChange={event => {
            const chosen = cardAlternatives.find(item => String(item.id) === event.target.value);
            setSelectedAlternative(event.target.value);
            setAiConsent(autoAiMode); setAiResult(null);
            if (chosen) perform('Проверяем выбранную карточку…', async () => {
              applyRecognizedCard(chosen, importId);
              await automaticallyEnhance(importId, String(chosen.id), { manualChanges: {}, selectionRequired: false, aiNeed: chosen.aiNeed });
            });
            else { resetRecognizedFields(); invalidate(); }
          }}><option value="">Выберите лист</option>{cardAlternatives.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</DocumentSelect></label>}
          <div className="document-ai-controls"><strong>Распознавание с ИИ Васей</strong><p className="document-hint">Вася разбирает карточки и помогает с реквизитами. Помогает бедолагам чем может)</p>
            {!aiAvailable && <p className="document-hint">ИИ не настроен. Локальное распознавание работает без передачи карточки внешнему сервису.</p>}
            {alternativeRequired && <p className="document-hint">Перед уточнением с ИИ выберите лист с карточкой клиента.</p>}
            {hasManualChanges && <p className="document-hint">Есть ручные исправления. Чтобы использовать ИИ, сначала повторно распознайте карточку локально; текущие исправления будут заменены.</p>}
            <label className="document-confirm"><input type="checkbox" checked={autoAiMode} onChange={event => {
              const enabled = event.target.checked;
              aiSession.setMode(enabled);
              setAutoAiMode(enabled); setAiConsent(enabled);
              if (enabled && importId && card && !alternativeRequired && !hasManualChanges) perform('Уточняем реквизиты с ИИ…', () => automaticallyEnhance(importId, selectedAlternative, { mode: true, consent: true }));
            }} />Вася всегда на старте</label>
            {!autoAiMode && <label className="document-confirm"><input type="checkbox" checked={aiConsent} disabled={!aiAvailable || alternativeRequired || hasManualChanges} onChange={event => setAiConsent(event.target.checked)} />Разрешаю отправить текст выбранной карточки в OpenAI для распознавания реквизитов.</label>}
            <button type="button" className="secondary-button" disabled={(onlyWhenNeeded && aiNeed?.needed !== true) || !aiAvailable || !aiConsent || !card || !importId || alternativeRequired || hasManualChanges || Boolean(busy)} onClick={enhanceWithAi}>{autoAiBlocked ? 'Позвать Васю ещё раз' : 'Позвать Васю на помощь'}</button>
            {onlyWhenNeeded && importId && !alternativeRequired && aiNeed?.needed === false && !aiResult && <p className="document-message" role="status">{skippedAiMessage(aiNeed)}</p>}
            {aiResult && (onlyWhenNeeded || aiResult.status !== 'skipped') && <p className={`document-message ${aiResult.status === 'fallback' ? 'document-message--warning' : ''}`} role="status">{aiResult.status === 'succeeded' ? 'Вася помог разобрать карточку. Проверьте дополненные реквизиты.' : aiResult.message || 'Используется локальное распознавание: уточнение с ИИ не выполнено.'}</p>}
          </div>
        </fieldset>
        <fieldset disabled={Boolean(busy)} className="document-fieldset"><legend>3. Проверка реквизитов</legend>
          {verificationConfigured && <><button type="button" className="secondary-button" disabled={Boolean(busy) || verificationBusy || alternativeRequired || !fields.inn} onClick={verifyExternal}>Проверить контрагента по внешним источникам</button><CounterpartyVerification report={verificationReport} onChoose={chooseVerifiedField} busy={verificationBusy} /></>}
          <div className="document-check-summary" role="status"><strong>Автоматическая проверка</strong><p>Проверено полей: {checkedCount}. Требуют уточнения: {attention.filter(item => item.status === 'needs_input').length + pendingReview.length}.</p></div>
          <div className="document-grid">
            <div className={`field ${fieldHints('type').fieldIssues.length ? 'document-field--issue' : ''}`}><label htmlFor={`${id}-type-input`}>Тип клиента</label><DocumentSelect aria-label="Тип клиента" id={`${id}-type-input`} value={fields.type} aria-invalid={checkByField.type?.status === 'needs_input'} onChange={(event) => changeField('type', event.target.value)}><option value="">Выберите тип</option><option value="ip">ИП</option><option value="ooo">ООО</option></DocumentSelect>{inlineFieldReview('type')}</div>
            {FIELD_DEFINITIONS.filter(([key]) => visibleCheck(key)).map(([key, label]) => {
              const { fieldIssues } = fieldHints(key);
              const currentCheck = checkByField[key];
              const fieldProps = { value: fields[key], autoComplete: 'off', id: `${id}-${key}-input`,
                'aria-invalid': currentCheck?.status === 'needs_input' || validationErrors.some((item) => matchesClientField(item, key)),
                onChange: (event) => {
                  const input = event.target;
                  const value = input.value;
                  const caret = key === 'phone' ? russianPhoneCaret(value, formatRussianPhoneInput(value), input.selectionStart) : null;
                  changeField(key, value);
                  if (key === 'phone' && caret !== null) requestAnimationFrame(() => { if (input.isConnected && document.activeElement === input) input.setSelectionRange(caret, caret); });
                } };
              return <div key={key} className={`field ${['legalAddress', 'postalAddress', 'email', 'edo'].includes(key) ? 'document-field--wide' : ''} ${fieldIssues.length ? 'document-field--issue' : ''}`}><label htmlFor={`${id}-${key}-input`}>{label}</label>
                {['email', 'edo'].includes(key) ? <textarea {...fieldProps} rows={3} wrap="soft" /> : <input {...fieldProps} type={key === 'phone' ? 'tel' : 'text'} inputMode={key === 'phone' ? 'tel' : ['inn', 'kpp', 'ogrn', 'ogrnip', 'bik', 'settlementAccount', 'correspondentAccount'].includes(key) ? 'numeric' : undefined} placeholder={key === 'phone' ? '+7 (977) 777-77-77' : undefined} />}
                {inlineFieldReview(key)}
              </div>;
            })}
          </div>
          <p className="document-hint">{registryConfirmation}</p>
          {(!fields.phone.trim() || !fields.email.trim()) && <p className="document-message document-message--warning" role="status">Не заполнены: {[!fields.phone.trim() && 'телефон', !fields.email.trim() && 'email'].filter(Boolean).join(', ')}. Договор можно создать без этих контактов. Подтвердите это вместе с проверкой реквизитов ниже.</p>}
          <label className="document-confirm"><input id={`${id}-confirmed-input`} type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setValidation(null); requestKey.current = null; }} />Подтверждаю выбранное юрлицо, дату и условия договора. Уточнения в выделенных полях внесены. {registryConfirmation} {(!fields.phone.trim() || !fields.email.trim()) && 'Согласен создать договор без незаполненных телефона и/или email.'}</label>
        </fieldset>
        {validationErrors.length > 0 && !validation?.local && <div className="document-message document-message--error" role="alert"><strong>Нужно исправить данные</strong><ul>{validationErrors.map((item, index) => <li key={index}>{messageOf(item)}</li>)}</ul></div>}
        {validation?.warnings?.length > 0 && !validation?.local && <ul className="document-message document-message--warning">{validation.warnings.map((item, index) => <li key={index}>{messageOf(item)}</li>)}</ul>}
        <div className="inline-actions document-actions"><button className="secondary-button" type="button" disabled={Boolean(busy) || invalidDays || !supplier || !date || alternativeRequired} onClick={check}>Проверить данные</button><button className="secondary-button" type="button" disabled={Boolean(busy) || !confirmed || invalidDays || !supplier || !date || draftReviewBlocked || alternativeRequired} onClick={() => create(null, false)}>Сохранить черновик</button><button className="primary-button" type="submit" disabled={Boolean(busy) || !confirmed} aria-describedby={`${id}-submit-feedback`}>{creationBusy ? busy : 'Создать договор — DOCX + PDF'}</button></div>
        <div id={`${id}-submit-feedback`}>
          {creationBusy && <div className="document-message" role="status"><strong>{busy}</strong>{busy === 'Формируем DOCX и PDF…' && <p>Подготовка файлов может занять некоторое время. Повторно нажимать кнопку не нужно.</p>}</div>}
          {!busy && error && <p className="document-message document-message--error">{error}</p>}
          {!busy && notice && <p className="document-message" role="status">{notice}</p>}
        </div>
        {alternativeRequired && <p className="document-hint">Сначала выберите лист с карточкой клиента в разделе загрузки.</p>}
        {draftReviewBlocked && <p className="document-hint">Перед сохранением черновика подтвердите неоднозначные значения в выделенных полях. Незаполненные поля можно дополнить позже.</p>}
        {creationBlocked && <div className="document-hint"><p>Заполните обязательные данные и подтвердите неоднозначные значения в подсвеченных полях.</p><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => focusFirstAttention()}>Перейти к первому полю</button></div>}
        {!confirmed && <p className="document-hint">Для создания подтвердите проверку данных. Изменение поля сбрасывает подтверждение.</p>}
      </form> : <p className="document-hint">{archiveOnly ? 'Выберите зарегистрированного клиента для создания нового договора.' : 'Создание договора недоступно для вашей роли. Здесь можно просматривать разрешённые документы.'}</p>}
      </div>
      <div hidden={view === 'create'}>
      <div className="document-list-heading" id={`${id}-saved-contracts`}><h3>{trashView ? 'Корзина договоров' : 'Сохранённые договоры'}</h3><div className="document-actions">{canImportArchived && !trashView && <button type="button" className="secondary-button" disabled={Boolean(busy)} aria-expanded={historicOpen} aria-controls={`${id}-historic-import`} onClick={() => historicOpen ? setHistoricOpen(false) : openHistoricImport()}>Загрузить старый договор</button>}{archiveCapabilities.restore && <button type="button" className="secondary-button" disabled={Boolean(busy)} aria-pressed={trashView} onClick={toggleTrash}>{trashView ? 'Сохранённые договоры' : 'Корзина'}</button>}<button type="button" className="secondary-button" disabled={Boolean(busy) || options.enabled === false} onClick={() => perform('Обновляем список…', trashView ? refreshTrash : refresh)}>Обновить список</button></div></div>
      <nav className="document-folder-tabs" aria-label="Папки договоров">{Object.entries(SAVED_DOCUMENT_FOLDERS).map(([folder, label]) => <button key={folder} type="button" className={`secondary-button document-folder-tab${savedFolder === folder ? ' document-folder-tab--active' : ''}`} aria-pressed={savedFolder === folder} disabled={Boolean(busy)} onClick={() => { if (savedFolder !== folder) { setSavedFolder(folder); historicRequestKey.current = null; setHistoricNotice(''); } setPendingTrashId(null); setPendingPurgeId(null); }}>{label}{folder === 'clients' && unsignedClientCount > 0 && <span className="document-folder-badge" aria-label={`Без подписанного скана: ${unsignedClientCount}`}>{unsignedClientCount}</span>}</button>)}</nav>
      {savedFolder === 'clients' && unsignedClientCount > 0 && !trashView && <p className="document-hint">Без подписанного скана: {unsignedClientCount}.</p>}
      {canImportArchived && !trashView && historicOpen && <form id={`${id}-historic-import`} className="document-historic-import" onSubmit={importHistoric} noValidate><fieldset className="document-fieldset" disabled={Boolean(busy)}><legend>Подписанный старый договор</legend><p className="document-hint">Сохранится в папку «{SAVED_DOCUMENT_FOLDERS[savedFolder]}».</p><div className="document-grid">
        <label className="field">Наше юрлицо<DocumentSelect aria-label="Наше юрлицо для старого договора" value={historicDraft.legalEntityId} onChange={event => editHistoric('legalEntityId', event.target.value)}><option value="">Выберите юрлицо</option>{(options.archiveLegalEntities || options.legalEntities || []).map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</DocumentSelect></label>
        <label className="field">Номер старого договора<input maxLength={100} value={historicDraft.number} onChange={event => editHistoric('number', event.target.value)} /></label>
        <label className="field document-field--wide">Наименование контрагента<input maxLength={2000} value={historicDraft.fullName} onChange={event => editHistoric('fullName', event.target.value)} /></label>
        <label className="field document-field--wide">Подписанный договор<input key={historicFileKey} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => { setHistoricFile(event.target.files?.[0] || null); setHistoricError(''); setHistoricNotice(''); historicRequestKey.current = null; }} /></label>
      </div><div className="document-actions"><button className="primary-button" disabled={Boolean(busy)}>{busy === 'Сохраняем старый договор…' ? busy : 'Сохранить в архив'}</button><button className="secondary-button" type="button" onClick={() => setHistoricOpen(false)}>Закрыть</button></div>
        {busy === 'Сохраняем старый договор…' && <p className="document-message" role="status">Загружаем подписанный договор…</p>}
        {historicError && <p className="document-message document-message--error" role="alert">{historicError}</p>}
        {historicNotice && <p className="document-message" role="status">{historicNotice}</p>}
      </fieldset></form>}
      {trashView && <p className="document-hint">Договоры в корзине сохраняют свой номер и файлы. Восстановите договор, чтобы скачать документы или прикрепить подписанный экземпляр.</p>}
      {archiveFeedback?.kind === 'success' && <p className="document-message" role="status">{archiveFeedback.message}</p>}
      <label className="field document-archive-search">Поиск по названию или ИНН<input type="search" value={savedInn} onChange={(event) => setSavedInn(event.target.value)} placeholder="Начните вводить название или ИНН" /></label>
      {savedDocuments.length === 0 ? <p className="document-hint">{savedInn ? 'По этому запросу договоров не найдено.' : trashView ? 'В этой папке корзина пуста.' : 'В этой папке договоров пока нет.'}</p> : <ul className="document-list">{savedDocuments.map((document) => <li key={document.id} className={`document-card ${trashView ? 'document-card--trashed' : hasSignedScan(document) ? 'document-card--signed' : 'document-card--unsigned'}`}>
        <div><strong>{isImportedContract(document) ? 'Загруженный договор' : 'Договор'} {document.number ? `№ ${document.number}` : 'без номера'}</strong><span className="document-status">{document.status === 'purging' ? STATUSES.purging : trashView ? 'В корзине' : STATUSES[document.status] || document.status}</span>{document.createdAt && <p className="document-hint">{new Date(document.createdAt).toLocaleDateString('ru-RU')}</p>}</div>
        {document.status === 'purging' ? <p className="document-message document-message--warning" role="status">Удаление не завершено — повторите удаление.</p> : <><p className="document-hint">{document.counterparty?.fullName}{document.counterparty?.inn && ` · ИНН ${document.counterparty.inn}`}</p><p className="document-signature-state">{hasSignedScan(document) ? 'Подписанный скан прикреплён' : 'Подписанный скан не прикреплён'}</p></>}
        <div className="inline-actions document-actions">{!trashView && (document.files || []).filter(file => (file.type || file.kind) !== 'attachment').map((file) => <button key={file.id} className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => download(document, file)}>Скачать {fileLabel(file)}</button>)}
          {documentTrashActions(document, archiveCapabilities, trashView).trash && <button type="button" className="secondary-button document-trash-button" disabled={Boolean(busy)} onClick={() => { setPendingTrashId(document.id); setArchiveFeedback(null); }}>Удалить</button>}
          {documentTrashActions(document, archiveCapabilities, trashView).restore && <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => changeTrash(document, true)}>Восстановить</button>}
          {trashView && archiveCapabilities.purge && document.canPurge === true && typeof api.purgeDocument === 'function' && <button type="button" className="secondary-button document-trash-button" disabled={Boolean(busy)} onClick={() => { setPendingPurgeId(document.id); setArchiveFeedback(null); }}>Удалить навсегда</button>}
        </div>
        {pendingPurgeId === document.id && trashView && document.canPurge === true && <div className="document-message document-message--warning document-trash-confirm"><strong>Удалить навсегда договор {document.number ? `№ ${document.number}` : 'без номера'}?</strong><p>Все файлы этого договора, подписанные сканы, допсоглашения и другие документы будут удалены без возможности восстановления. Номер договора повторно не используется.</p><div className="document-actions"><button type="button" className="secondary-button document-trash-button" disabled={Boolean(busy)} onClick={() => purge(document)}>Удалить весь пакет навсегда</button><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => setPendingPurgeId(null)}>Отмена</button></div></div>}
        {pendingTrashId === document.id && documentTrashActions(document, archiveCapabilities, trashView).trash && <div className="document-message document-message--warning document-trash-confirm"><strong>Удалить договор {document.number ? `№ ${document.number}` : 'без номера'}?</strong><p>{document.counterparty?.fullName || 'Наименование клиента не указано'}. Договор будет перемещён в корзину; его можно восстановить.</p><div className="document-actions"><button type="button" className="secondary-button document-trash-button" disabled={Boolean(busy)} onClick={() => changeTrash(document)}>Переместить в корзину</button><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => setPendingTrashId(null)}>Отмена</button></div></div>}
        {archiveFeedback?.id === document.id && ['loading', 'error'].includes(archiveFeedback.kind) && <p className={`document-message ${archiveFeedback.kind === 'error' ? 'document-message--error' : ''}`} role={archiveFeedback.kind === 'error' ? 'alert' : 'status'}>{archiveFeedback.message}</p>}
        {generationFeedback?.id === document.id && <p className={`document-message ${generationFeedback.kind === 'error' ? 'document-message--error' : ''}`} role={generationFeedback.kind === 'error' ? 'alert' : 'status'}>{generationFeedback.message}</p>}
        {generationFeedback?.id === document.id && generationFeedback.verification && <CounterpartyVerification report={generationFeedback.verification} />}
        {!trashView && !isImportedContract(document) && !(document.files || []).length && <><p className="document-hint">Файлы ещё не сформированы.</p>{(document.canCreate ?? canCreate) && document.status === 'draft' && <><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => resumeGeneration(document)}>{generationFeedback?.id === document.id && generationFeedback.kind === 'loading' ? generationFeedback.message : 'Сформировать DOCX + PDF'}</button>{draftReviewPane(document)}</>}</>}
        {!trashView && (document.canUploadSigned ?? canUploadSigned) && ['generated', 'sent', 'signing'].includes(document.status) && <details className="document-scan-details"><summary>Прикрепить подписанный скан</summary><fieldset className="document-fieldset document-signed" disabled={Boolean(busy)}><legend>Подписанный экземпляр</legend><div className="document-grid"><label className="field">Файл с подписями<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setSignedFiles((current) => ({ ...current, [document.id]: event.target.files?.[0] || null }))} /></label></div><button className="secondary-button" type="button" disabled={!signedFiles[document.id]} onClick={() => uploadSigned(document)}>Загрузить и отметить подписанным</button></fieldset></details>}
        {!trashView && <ContractDocuments document={document} canAttach={canAttachDocumentFiles(document, canAttach) && typeof api.uploadDocumentAttachment === 'function'} api={api} busy={busy} perform={perform} refresh={refresh} download={download} alive={alive} />}
      </li>)}</ul>}
      </div>
    </>}
  </section>;
}
