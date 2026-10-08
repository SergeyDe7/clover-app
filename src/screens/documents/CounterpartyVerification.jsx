import { useId } from 'react';
import { officialVerificationUrl, hasVerifiedRegistryField } from '../../shared/contracts/verificationSnapshot.js';
import './CounterpartyVerification.css';

const SOURCE_NAMES = { fns: 'ФНС — реквизиты', arbitration: 'Арбитражные дела', fssp: 'Исполнительные производства', bankruptcy: 'Банкротство — Федресурс' };
const FIELD_NAMES = { type: 'Тип контрагента', fullName: 'Полное наименование', inn: 'ИНН', kpp: 'КПП', ogrn: 'ОГРН', ogrnip: 'ОГРНИП', legalAddress: 'Юридический адрес', signerFullName: 'ФИО подписанта', signerPosition: 'Должность подписанта' };

function Provenance({ sourceUrl, checkedAt, sourceId }) {
  const url = officialVerificationUrl(sourceUrl);
  const date = checkedAt && Number.isFinite(Date.parse(checkedAt)) ? new Date(checkedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : null;
  return <p className="counterparty-verification__source">{url && <a href={url} target="_blank" rel="noopener noreferrer">{SOURCE_NAMES[sourceId] || 'Официальный источник'}</a>}{date && <span>Проверено: {date} (МСК)</span>}</p>;
}

export default function CounterpartyVerification({ report, onChoose, busy = false }) {
  const headingId = useId();
  const sources = Array.isArray(report?.sources) ? report.sources : [];
  const fnsChecked = sources.some(source => source.id === 'fns' && ['checked', 'partial'].includes(source.status));
  const comparisons = fnsChecked && Array.isArray(report?.comparisons) ? report.comparisons.filter(item => item.sourceId === 'fns' && hasVerifiedRegistryField(report, item.field)) : [];
  return <section className="counterparty-verification" aria-labelledby={headingId} aria-busy={busy}>
    <h3 id={headingId}>Проверка по внешним источникам</h3>
    {busy && <p role="status">Проверяем сведения…</p>}
    {!report && !busy && <p role="status">Не проверено. Запустите проверку контрагента.</p>}
    {report && <div className="counterparty-verification__sources">{Object.entries(SOURCE_NAMES).map(([id, name]) => {
      const source = sources.find(item => item.id === id);
      const checked = source?.status === 'checked';
      const partial = source?.status === 'partial';
      const reason = source?.status === 'ambiguous' ? 'Не удалось однозначно определить контрагента.' : source?.status === 'unavailable' ? (typeof source.message === 'string' && source.message.length <= 2000 ? source.message : 'Источник недоступен.') : source?.status === 'not_configured' ? 'Источник ещё не подключён.' : 'Проверка не выполнена.';
      return <article key={id} className={`counterparty-verification__card ${checked ? 'counterparty-verification__card--checked' : ''}`}>
        <h4>{name}</h4><p><strong>{checked ? 'Проверено' : partial ? 'Проверено частично' : 'Не проверено'}</strong>{!checked && !partial && ` — ${reason}`}</p>
        {partial && <><p>Полная проверка не завершена. Не подтверждено: {(source.missingFields || []).map(field => FIELD_NAMES[field] || field).join(', ') || 'часть реквизитов'}.</p><Provenance {...source} sourceId={id} /></>}
        {checked && <><Provenance {...source} sourceId={id} />{id !== 'fns' && <><p>{id === 'bankruptcy' ? 'Найдено в публичном поиске Федресурса по ИНН' : 'Записей в ответе источника'}: {Number.isSafeInteger(source.total) ? source.total : Array.isArray(source.records) ? source.records.length : 0}.</p>{Array.isArray(source.records) && source.records.length > 0 && <ul>{source.records.map((record, index) => <li key={record.id || index}>{record.summary}<Provenance sourceUrl={record.url} sourceId={id} /></li>)}</ul>}<p>Сведения о делах, производствах и банкротстве оцениваются отдельно от реквизитов. Отсутствие найденных записей не подтверждает надёжность контрагента.</p></>}</>}
      </article>;
    })}</div>}
    {comparisons.length > 0 && <div className="counterparty-verification__comparisons">{comparisons.map(item => {
      const conflict = ['choice', 'conflict'].includes(item.status);
      const missing = ['proposal', 'missing'].includes(item.status);
      const name = FIELD_NAMES[item.field] || item.field;
      return <article key={item.field} className={`counterparty-verification__card ${conflict ? 'counterparty-verification__card--conflict' : ''}`}>
        <h4>{name}</h4>
        {item.status === 'match' ? <p>Совпадает с реестром: {item.registry}</p> : item.status === 'selected_original' ? <p>Оставлено значение из карточки: {item.original}</p> : <>
          <p><strong>{conflict ? 'Найдены разные значения' : missing ? 'Найдено автоматически' : 'Требует уточнения'}</strong></p>
          <dl><dt>Из карточки</dt><dd>{item.original || 'Не указано'}</dd><dt>Из реестра</dt><dd>{item.registry || 'Не указано'}</dd></dl>
          {conflict && <div className="counterparty-verification__choices"><button type="button" disabled={busy || !onChoose} aria-label={`${name}: использовать значение из карточки`} onClick={() => onChoose(item.field, 'original')}>Из карточки</button><button type="button" disabled={busy || !onChoose} aria-label={`${name}: использовать значение из реестра`} onClick={() => onChoose(item.field, 'registry')}>Из реестра</button></div>}
        </>}
        <Provenance {...item} />
      </article>;
    })}</div>}
    {Array.isArray(report?.warnings) && report.warnings.length > 0 && <ul className="counterparty-verification__warnings">{report.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message}</li>)}</ul>}
  </section>;
}
