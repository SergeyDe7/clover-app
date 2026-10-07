import DocumentSelect from './DocumentSelect.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { formatRussianPhoneInput, normalizeRussianPhone, russianPhoneCaret } from '../../shared/contracts/russianPhone.js';
import './DocumentWorkspace.css';
import './LegalEntitiesAdmin.css';

const FIELDS = [
  ['fullName', 'Полное наименование'], ['inn', 'ИНН'], ['kpp', 'КПП'], ['ogrn', 'ОГРН'], ['ogrnip', 'ОГРНИП'],
  ['legalAddress', 'Юридический адрес'], ['postalAddress', 'Почтовый адрес'], ['bankName', 'Банк'], ['bik', 'БИК'],
  ['settlementAccount', 'Расчётный счёт'], ['correspondentAccount', 'Корреспондентский счёт'],
  ['signerFullName', 'ФИО подписанта'], ['signerFullNameGenitive', 'ФИО подписанта в родительном падеже'],
  ['signerPosition', 'Должность подписанта'], ['signerPositionGenitive', 'Должность в родительном падеже'],
  ['authorityBasis', 'Основание полномочий нашего подписанта'], ['phone', 'Телефон'], ['accountingPhone', 'Телефон бухгалтерии'],
  ['email', 'Контактные email'], ['edo', 'ЭДО'],
];
const fresh = () => ({ id: crypto.randomUUID(), name: '', data: { type: 'ip', ...Object.fromEntries(FIELDS.map(([key]) => [key, ''])) } });
const PAYMENTS = { prepayment: 'Предоплата', postpayment: 'Постоплата' };
const TYPES = { ip: 'ИП', ooo: 'ООО' };
const REQUIRED = new Set(['fullName', 'inn', 'legalAddress', 'bankName', 'bik', 'settlementAccount', 'correspondentAccount', 'signerFullName', 'signerPosition']);
const describeFailure = (failure) => failure?.message || 'Операция не выполнена. Повторите попытку.';

export default function LegalEntitiesAdmin({ api, onChanged }) {
  const labelId = useId();
  const alive = useRef(false);
  const lock = useRef(false);
  const [entities, setEntities] = useState([]);
  const [draft, setDraft] = useState(fresh);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [approved, setApproved] = useState(false);
  const [file, setFile] = useState(null);
  const [paymentType, setPaymentType] = useState('prepayment');
  const [buyerType, setBuyerType] = useState('ip');
  const [basis, setBasis] = useState('');
  const [templateApproved, setTemplateApproved] = useState(false);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [templateId, setTemplateId] = useState(() => crypto.randomUUID());
  const selected = entities.find(entity => entity.id === draft.id);
  const unsaved = selected && (draft.name !== selected.name || ['type', ...FIELDS.map(([key]) => key)].some(key => (draft.data[key] || '') !== (selected.data?.[key] || '')));
  const requisitesReady = Boolean(selected?.approved && selected?.data?.type && selected?.revisionId);

  async function reload() {
    const result = await api.getDocumentLegalEntities();
    if (alive.current) setEntities(result.legalEntities || []);
  }
  useEffect(() => {
    alive.current = true;
    api.getDocumentLegalEntities().then(result => {
      if (alive.current) setEntities(result.legalEntities || []);
    }).catch(failure => { if (alive.current) setError(describeFailure(failure)); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [api]);

  async function perform(action, operation, success) {
    if (lock.current) return;
    lock.current = true; setBusy(action); setError(''); setNotice('');
    try {
      await operation();
      if (!alive.current) return;
      setNotice(success);
      if (['save', 'template', 'activation'].includes(action)) setActivationConfirmed(false);
      if (action !== 'reload' && action !== 'preview') onChanged?.();
      try { await reload(); } catch { if (alive.current) setError('Изменение сохранено, но список не обновился. Нажмите «Обновить список».'); }
    } catch (failure) { if (alive.current) setError(describeFailure(failure)); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  }
  function choose(entity) {
    setDraft(entity ? { id: entity.id, name: entity.name, data: { ...fresh().data, ...entity.data } } : fresh());
    setApproved(false); setTemplateApproved(false); setFile(null); setBasis(''); setTemplateId(crypto.randomUUID());
    setActivationConfirmed(false); setError(''); setNotice('');
  }
  function updateField(key, value) {
    setDraft(previous => ({ ...previous, data: { ...previous.data, [key]: value } }));
    setApproved(false); setActivationConfirmed(false);
  }
  function save(event) {
    event.preventDefault();
    perform('save', () => api.saveDocumentLegalEntity({ ...draft, approved: true }), 'Проверенные реквизиты сохранены новой версией.');
  }
  function upload(event) {
    event.preventDefault();
    if (!requisitesReady || unsaved || !file || !templateApproved || !basis.trim()) return;
    perform('template', async () => {
      await api.uploadDocumentTemplate({ file, templateId, entityId: selected.id, paymentType,
        config: { blocks: basis.trim() ? { BUYER_AUTHORITY_BASIS: basis.trim() } : {}, previousClientTokens: [], buyerTypes: [buyerType], supplierTypes: [selected.data.type] } });
      if (alive.current) { setFile(null); setTemplateApproved(false); setTemplateId(crypto.randomUUID()); }
    }, 'Утверждённый шаблон сохранён.');
  }
  function preview(template, buyer, format) {
    perform('preview', async () => {
      const blob = await api.previewDocumentTemplate(template.id, buyer, format);
      if (!alive.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `Образец_${template.paymentType}_${buyer}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }, 'Пробный документ скачан. Проверьте реквизиты и оформление. Это образец, номер договора не расходуется.');
  }

  return <section className="document-workspace legal-entities-admin" aria-labelledby={`${labelId}-title`} aria-busy={loading || Boolean(busy)}>
    <header className="panel-heading"><p className="eyebrow">Администратор · Договоры</p><h2 id={`${labelId}-title`}>Наши юрлица</h2>
      <p>Сохраните проверенные реквизиты и утверждённые шаблоны. Старые договоры сохраняют данные, с которыми были созданы.</p></header>
    {error && <div className="document-message document-message--error" role="alert">{error}</div>}
    {notice && <div className="document-message" role="status">{notice}</div>}
    {loading ? <p role="status">Загрузка юрлиц…</p> : <>
      <div className="document-actions"><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => choose(null)}>Добавить юрлицо</button>
        <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => perform('reload', reload, 'Список обновлён.')}>Обновить список</button></div>
      {!entities.length && <p className="document-hint">Юрлица ещё не добавлены. Заполните форму ниже.</p>}
      <ul className="legal-entity-list">{entities.map(entity => <li key={entity.id}><button type="button" disabled={Boolean(busy)} className={`secondary-button ${entity.id === draft.id ? 'legal-entity-selected' : ''}`} aria-pressed={entity.id === draft.id} onClick={() => choose(entity)}>
        <strong>{entity.name}</strong><span>ИНН {entity.data?.inn || 'не указан'} · {entity.active ? 'Активно' : 'Неактивно'}</span></button></li>)}</ul>
      <form onSubmit={save}><fieldset className="document-fieldset" disabled={Boolean(busy)}><legend>{selected ? 'Реквизиты юрлица' : 'Новое юрлицо'}</legend>
        <div className="document-grid"><label className="field">Название в списке<input required maxLength={200} value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setApproved(false); }} /></label>
          <label className="field">Тип юрлица<DocumentSelect aria-label="Тип юрлица" value={draft.data.type} onChange={event => updateField('type', event.target.value)}><option value="ip">ИП</option><option value="ooo">ООО</option></DocumentSelect></label>
          {FIELDS.filter(([key]) => draft.data.type === 'ip' ? !['kpp', 'ogrn'].includes(key) : key !== 'ogrnip').map(([key, label]) => <label className={`field ${['legalAddress', 'postalAddress', 'email', 'edo'].includes(key) ? 'document-field--wide' : ''}`} key={key}>{label}
            {['email', 'edo'].includes(key) ? <textarea maxLength={2000} value={draft.data[key] || ''} onChange={event => updateField(key, event.target.value)} />
              : <input required={REQUIRED.has(key) || (draft.data.type === 'ip' ? key === 'ogrnip' : ['ogrn', 'kpp'].includes(key))} value={draft.data[key] || ''} maxLength={2000} placeholder={key === 'phone' || key === 'accountingPhone' ? '+7 (977) 777-77-77' : undefined} inputMode={['inn', 'kpp', 'ogrn', 'ogrnip', 'bik', 'settlementAccount', 'correspondentAccount'].includes(key) ? 'numeric' : key === 'phone' || key === 'accountingPhone' ? 'tel' : 'text'} onChange={event => {
                const input = event.target; const value = input.value;
                const formatted = key === 'phone' || key === 'accountingPhone' ? formatRussianPhoneInput(value) : value;
                const caret = russianPhoneCaret(value, formatted, input.selectionStart);
                updateField(key, formatted);
                if (formatted !== value) requestAnimationFrame(() => { if (input.isConnected) input.setSelectionRange(caret, caret); });
              }} onBlur={() => { if (key === 'phone' || key === 'accountingPhone') { const normalized = normalizeRussianPhone(draft.data[key]); if (normalized !== null && normalized !== draft.data[key]) updateField(key, normalized); } }} />}
          </label>)}
        </div><label className="document-confirm"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} />Реквизиты и полномочия нашего подписанта проверены по документам.</label>
        <div className="document-actions"><button className="primary-button" disabled={!approved}>{busy === 'save' ? 'Сохранение…' : 'Сохранить реквизиты'}</button></div>
      </fieldset></form>
      {selected && <>
        <h3>Шаблоны договоров</h3><p className="document-hint">Для активации нужны четыре утверждённых варианта: предоплата и постоплата для покупателей ИП и ООО.</p>
        <ul className="legal-template-list">{Object.entries(PAYMENTS).flatMap(([payment, paymentLabel]) => Object.entries(TYPES).map(([buyer, buyerLabel]) => {
          const templates = (selected.templates || []).filter(template => template.paymentType === payment && (template.buyerTypes || []).includes(buyer));
          return <li key={`${payment}-${buyer}`}>{paymentLabel} · покупатель {buyerLabel}: <strong>{templates.length ? 'Шаблон добавлен' : 'Нет шаблона'}</strong>
            {templates[0] && <div className="document-actions"><button type="button" disabled={Boolean(busy) || Boolean(unsaved)} className="secondary-button" onClick={() => preview(templates[0], buyer, 'docx')}>Пробный DOCX</button><button type="button" disabled={Boolean(busy) || Boolean(unsaved)} className="secondary-button" onClick={() => preview(templates[0], buyer, 'pdf')}>Пробный PDF</button></div>}</li>;
        }))}</ul>
        {!requisitesReady && <p className="document-hint">Сначала заполните и сохраните проверенные реквизиты юрлица.</p>}
        {unsaved && <p className="document-hint">Сохраните изменения реквизитов перед добавлением шаблонов.</p>}
        <form onSubmit={upload}><fieldset className="document-fieldset" disabled={Boolean(busy) || !requisitesReady || Boolean(unsaved)}><legend>Добавить утверждённый шаблон</legend>
          <p className="document-hint">Загрузите подготовленный DOCX с переменными генератора. Договор с заполненными данными прежнего клиента не преобразуется автоматически. Юридические условия должны быть утверждены заранее.</p>
          <div className="document-grid"><label className="field">Оплата<DocumentSelect aria-label="Оплата" value={paymentType} onChange={event => { setPaymentType(event.target.value); setTemplateApproved(false); }}>{Object.entries(PAYMENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DocumentSelect></label>
            <label className="field">Тип покупателя<DocumentSelect aria-label="Тип покупателя" value={buyerType} onChange={event => { setBuyerType(event.target.value); setTemplateApproved(false); }}>{Object.entries(TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DocumentSelect></label>
            <label className="field document-field--wide">Шаблон DOCX<input key={templateId} required type="file" accept=".docx" onChange={event => { setFile(event.target.files?.[0] || null); setTemplateApproved(false); }} /></label>
            <label className="field document-field--wide">Утверждённое основание полномочий покупателя<input required value={basis} maxLength={15000} onChange={event => { setBasis(event.target.value); setTemplateApproved(false); }} /></label>
          </div><label className="document-confirm"><input type="checkbox" checked={templateApproved} onChange={event => setTemplateApproved(event.target.checked)} />Шаблон утверждён, соответствует выбранному варианту и не содержит реквизитов прежнего покупателя.</label>
          <button className="primary-button" disabled={!file || !templateApproved || !basis.trim()}>{busy === 'template' ? 'Загрузка…' : 'Сохранить шаблон'}</button>
        </fieldset></form>
        <fieldset className="document-fieldset" disabled={Boolean(busy)}><legend>{selected.active ? 'Активное юрлицо' : 'Активация юрлица'}</legend>
          <p className="document-hint">Перед активацией проверьте пробные DOCX и PDF всех четырёх вариантов. Неактивное юрлицо недоступно для новых договоров.</p>
          <label className="document-confirm"><input type="checkbox" checked={activationConfirmed} onChange={event => setActivationConfirmed(event.target.checked)} />{selected.active ? 'Подтверждаю отключение юрлица для новых договоров.' : 'Реквизиты, шаблоны и пробные DOCX и PDF проверены. Подтверждаю активацию.'}</label>
          {unsaved && <p className="document-hint">Сначала сохраните изменения реквизитов.</p>}
          <button type="button" className="primary-button" disabled={!activationConfirmed || Boolean(unsaved)} onClick={() => perform('activation', () => api.setDocumentLegalEntityActive(selected.id, !selected.active), selected.active ? 'Юрлицо отключено для новых договоров.' : 'Юрлицо активировано.')}>{busy === 'activation' ? 'Сохранение…' : selected.active ? 'Отключить юрлицо' : 'Активировать юрлицо'}</button>
        </fieldset>
      </>}
    </>}
  </section>;
}
