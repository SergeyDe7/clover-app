import { useId, useState } from 'react';
import DocumentWorkspace from './DocumentWorkspace.jsx';
import LegalEntitiesAdmin from './LegalEntitiesAdmin.jsx';
import './DocumentNavigation.css';
import './AdminDocumentCenter.css';

export function AdminDocumentCenter({ api }) {
  const id = useId();
  const [tab, setTab] = useState('contracts');
  const [revision, setRevision] = useState(0);

  return <section className="admin-document-center" aria-label="Договоры администратора">
    <nav aria-label="Разделы договоров" className="document-section-navigation">
      <button type="button" aria-pressed={tab === 'contracts'} aria-controls={`${id}-documents`} onClick={() => setTab('contracts')}>Договоры</button>
      <button type="button" aria-pressed={tab === 'saved'} aria-controls={`${id}-documents`} onClick={() => setTab('saved')}>Сохранённые договоры</button>
      <button type="button" aria-pressed={tab === 'entities'} aria-controls={`${id}-entities`} onClick={() => setTab('entities')}>Наши юрлица</button>
    </nav>
    <div hidden={tab === 'entities'} id={`${id}-documents`}>
      <DocumentWorkspace standalone clientId={null} api={api} title={tab === 'saved' ? 'Сохранённые договоры' : 'Договоры'} refreshToken={revision} view={tab === 'saved' ? 'archive' : 'create'} onShowSaved={() => setTab(current => current === 'contracts' ? 'saved' : current)} />
    </div>
    <div hidden={tab !== 'entities'} id={`${id}-entities`}><LegalEntitiesAdmin api={api} onChanged={() => setRevision(value => value + 1)} /></div>
  </section>;
}
