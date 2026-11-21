import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { testSuitesApi } from '../api.js';
import { TEST_SUITE_STATUSES } from '../constants.js';
import { formatDate, suiteDeleteMessage } from '../format.js';
import Modal from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import TestSuiteForm from '../components/TestSuiteForm.jsx';
import { useDiscardGuard } from '../use-discard-guard.js';

export default function TestSuitesPage() {
  const { setDirty, guard } = useDiscardGuard();
  const navigate = useNavigate();
  const [suites, setSuites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('');

  // modal: null | { type: 'add' } | { type: 'edit', suite } | { type: 'delete', suite }
  const [modal, setModal] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const closeModal = useCallback(() => {
    setModal(null);
    setDeleteError('');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSuites(await testSuitesApi.list(status));
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (values) => {
    if (modal.type === 'edit') {
      await testSuitesApi.update(modal.suite.id, values);
      closeModal();
      load();
    } else {
      const created = await testSuitesApi.create(values);
      closeModal();
      navigate(`/test-suites/${created.id}`); // straight to adding test cases
    }
  };

  const handleDelete = async () => {
    try {
      await testSuitesApi.remove(modal.suite.id);
      closeModal();
      load();
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  return (
    <main className="page">
      <div className="page-header">
        <h1>Test suites</h1>
        <button type="button" className="button button-primary" onClick={() => setModal({ type: 'add' })}>
          + New suite
        </button>
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {TEST_SUITE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loadError && <p className="form-error" role="alert">Could not load test suites: {loadError}</p>}

      <div className={`table-wrap${loading ? ' is-loading' : ''}`}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Feature</th>
              <th>Status</th>
              <th className="num">Cases</th>
              <th>Updated</th>
              <th><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {suites?.map((s) => (
              <tr key={s.id}>
                <td className="title-cell"><Link to={`/test-suites/${s.id}`}>{s.name}</Link></td>
                <td>{s.feature}</td>
                <td><span className={`status-text status-${s.status}`}>{s.status}</span></td>
                <td className="num">{s.caseCount}</td>
                <td className="nowrap">{formatDate(s.updatedAt)}</td>
                <td className="actions-cell">
                  <RowMenu
                    label={s.name}
                    onEdit={() => setModal({ type: 'edit', suite: s })}
                    onDelete={() => setModal({ type: 'delete', suite: s })}
                  />
                </td>
              </tr>
            ))}
            {suites && suites.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {status ? `No suites with status "${status}".` : 'No test suites yet. Create the first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <Modal title={modal.type === 'edit' ? 'Edit test suite' : 'New test suite'} onClose={guard(closeModal)}>
          <TestSuiteForm
            initial={modal.suite}
            onSubmit={handleSave}
            onCancel={guard(closeModal)}
            onDirtyChange={setDirty}
          />
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete test suite?" onClose={closeModal}>
          <p>{suiteDeleteMessage(modal.suite.name, modal.suite.caseCount)}</p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={closeModal}>Cancel</button>
            <button type="button" className="button button-danger" onClick={handleDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
