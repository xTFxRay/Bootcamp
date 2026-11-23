import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { testCasesApi } from '../api.js';
import { TEST_CASE_STATUSES } from '../constants.js';
import Modal from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';
import TestCaseForm from '../components/TestCaseForm.jsx';
import { formatDate } from '../format.js';
import { useDiscardGuard } from '../use-discard-guard.js';

export default function TestCasesPage() {
  const { setDirty, guard } = useDiscardGuard();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: 'updated', order: 'desc' });
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // modal: null | { type: 'add' } | { type: 'edit', testCase } | { type: 'delete', testCase }
  const [modal, setModal] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const closeModal = useCallback(() => {
    setModal(null);
    setDeleteError('');
  }, []);

  // Quick search opens a test case with ?edit=ID: show it in the edit dialog, then tidy the address.
  const [params, setParams] = useSearchParams();
  const editId = params.get('edit');
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    testCasesApi
      .get(editId)
      .then((testCase) => !cancelled && setModal({ type: 'edit', testCase }))
      .catch((err) => !cancelled && setLoadError(`Couldn't open test case #${editId}: ${err.message}`))
      .finally(() => !cancelled && setParams((p) => { const next = new URLSearchParams(p); next.delete('edit'); return next; }, { replace: true }));
    return () => {
      cancelled = true;
    };
  }, [editId, setParams]);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await testCasesApi.list({ page, status, search, sort: sort.key, order: sort.order });
      // If the current page is now past the end (e.g. after a delete), step back.
      if (data.items.length === 0 && page > 1) {
        setPage(data.totalPages);
        return;
      }
      setResult(data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, status, search, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, order: s.order === 'desc' ? 'asc' : 'desc' } : { key, order: 'desc' }));
    setPage(1);
  };

  const handleSave = async (values) => {
    if (modal.type === 'edit') await testCasesApi.update(modal.testCase.id, values);
    else await testCasesApi.create(values);
    closeModal();
    load();
  };

  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await testCasesApi.remove(modal.testCase.id);
      closeModal();
      load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const sortHeader = (key, label) => {
    const active = sort.key === key;
    const arrow = active ? (sort.order === 'desc' ? '↓' : '↑') : '↕';
    return (
      <th aria-sort={active ? (sort.order === 'desc' ? 'descending' : 'ascending') : 'none'}>
        <button type="button" className={`sort-button${active ? ' active' : ''}`} onClick={() => toggleSort(key)}>
          {label} <span aria-hidden="true">{arrow}</span>
        </button>
      </th>
    );
  };

  const items = result?.items ?? [];
  const firstShown = result && result.total > 0 ? (result.page - 1) * result.pageSize + 1 : 0;
  const lastShown = result ? firstShown + items.length - (items.length ? 1 : 0) : 0;
  const filtered = status || search;

  return (
    <main className="page">
      <div className="page-header">
        <h1>Test cases</h1>
        <div className="header-actions">
          {result && result.total > 0 ? (
            <a
              className="button"
              href={testCasesApi.exportCsvUrl({ status, search: search.trim(), sort: sort.key, order: sort.order })}
              download
              title={`Downloads ${filtered ? 'the' : 'all'} ${result.total} test ${result.total === 1 ? 'case' : 'cases'}${filtered ? ' matching the current filters' : ''}, in the order shown`}
            >
              Download CSV{filtered ? ` (${result.total})` : ''}
            </a>
          ) : (
            <button type="button" className="button" disabled title="No test cases to download">Download CSV</button>
          )}
          <Link className="button" to="/test-cases/import">Import CSV</Link>
          <button type="button" className="button button-primary" onClick={() => setModal({ type: 'add' })}>
            + New test case
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search by title"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search by title"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {TEST_CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loadError && <p className="form-error" role="alert">Could not load test cases: {loadError}</p>}

      <div className={`table-wrap${loading ? ' is-loading' : ''}`}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              {sortHeader('severity', 'Severity')}
              <th>Status</th>
              {sortHeader('updated', 'Updated')}
              <th><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((tc) => (
              <tr key={tc.id}>
                <td className="title-cell">{tc.title}</td>
                <td><SeverityBadge severity={tc.severity} /></td>
                <td><span className={`status-text status-${tc.status}`}>{tc.status}</span></td>
                <td className="nowrap">{formatDate(tc.updatedAt)}</td>
                <td className="actions-cell">
                  <RowMenu
                    label={tc.title}
                    onEdit={() => setModal({ type: 'edit', testCase: tc })}
                    onDelete={() => setModal({ type: 'delete', testCase: tc })}
                  />
                </td>
              </tr>
            ))}
            {result && items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {filtered ? 'No test cases match your search or filter.' : 'No test cases yet. Add the first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="pagination">
          <span>Showing {firstShown}–{lastShown} of {result.total}</span>
          <div className="pagination-buttons">
            <button type="button" className="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              ← Previous
            </button>
            <span>Page {result.page} of {result.totalPages}</span>
            <button type="button" className="button" onClick={() => setPage((p) => p + 1)} disabled={page >= result.totalPages}>
              Next →
            </button>
          </div>
        </div>
      )}

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <Modal title={modal.type === 'edit' ? 'Edit test case' : 'New test case'} onClose={guard(closeModal)}>
          <TestCaseForm
            initial={modal.testCase}
            onSubmit={handleSave}
            onCancel={guard(closeModal)}
            onDirtyChange={setDirty}
          />
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Delete test case?" onClose={closeModal}>
          <p>“{modal.testCase.title}” will be deleted and removed from any test suites. This can't be undone.</p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="form-actions">
            <button type="button" className="button" onClick={closeModal} disabled={deleting}>Cancel</button>
            <button type="button" className="button button-danger" onClick={handleDelete} disabled={deleting} aria-busy={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
