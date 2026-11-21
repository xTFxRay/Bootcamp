import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { bugsApi } from '../api.js';
import { BUG_PRIORITIES, BUG_STATUSES, SEVERITIES } from '../constants.js';
import { formatDate } from '../format.js';
import { useDiscardGuard } from '../use-discard-guard.js';
import BugForm from '../components/BugForm.jsx';
import Modal from '../components/Modal.jsx';
import SeverityBadge from '../components/SeverityBadge.jsx';

// The first click on a column sorts the most useful way: newest, most severe, highest priority, A–Z.
const FIRST_ORDER = { updated: 'desc', severity: 'desc', priority: 'desc', title: 'asc' };

// Reads one value from the address, ignoring anything that isn't on the allowed list.
const pick = (params, key, allowed) => {
  const value = params.get(key) ?? '';
  return allowed.includes(value) ? value : '';
};

export default function BugsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setDirty, guard } = useDiscardGuard();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Set when arriving here right after deleting a bug: { id, title }.
  const [deleted] = useState(() => location.state?.deleted ?? null);
  useEffect(() => {
    // Forget it in the browser history, so a reload or Back doesn't show the message again.
    if (location.state?.deleted) navigate(location.pathname + location.search, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters, search, sort and page live in the address (e.g. /bugs?status=open&page=2),
  // so coming back from a bug, reloading, or sharing the link keeps the same list.
  const [params, setParams] = useSearchParams();
  const status = pick(params, 'status', BUG_STATUSES);
  const severity = pick(params, 'severity', SEVERITIES);
  const priority = pick(params, 'priority', BUG_PRIORITIES);
  const search = (params.get('search') ?? '').trim();
  const sortKey = pick(params, 'sort', Object.keys(FIRST_ORDER)) || 'updated';
  const order = pick(params, 'order', ['asc', 'desc']) || FIRST_ORDER[sortKey];
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);

  // Changes some values in the address; '' or null removes one. Replaces the history entry,
  // so Back goes to the previous page rather than through every filter change.
  const updateParams = useCallback(
    (changes) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === '' || value == null) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const [searchInput, setSearchInput] = useState(search);
  const [showForm, setShowForm] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const closeForm = useCallback(() => setShowForm(false), []);

  // Wait until typing pauses before searching. A new search starts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) updateParams({ search: searchInput.trim(), page: null });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  useEffect(() => {
    let cancelled = false; // ignore replies to older requests, so the table always matches the filters
    setLoading(true);
    bugsApi
      .list({ status, severity, priority, search, page, sort: sortKey, order })
      .then((data) => {
        if (cancelled) return;
        // Past the last page (e.g. a bookmarked link after bugs were deleted): go to the last one.
        if (data.items.length === 0 && page > 1) return updateParams({ page: data.totalPages > 1 ? data.totalPages : null });
        setResult(data);
        setLoadError('');
      })
      .catch((err) => !cancelled && setLoadError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, severity, priority, search, page, sortKey, order, reloadKey, updateParams]);

  const setFilter = (key) => (e) => updateParams({ [key]: e.target.value, page: null });
  const setPage = (n) => updateParams({ page: n > 1 ? n : null });

  const toggleSort = (key) => {
    const nextOrder = sortKey === key ? (order === 'desc' ? 'asc' : 'desc') : FIRST_ORDER[key];
    // Leave defaults out of the address, so a plain /bugs stays plain.
    updateParams({
      sort: key === 'updated' ? null : key,
      order: nextOrder === FIRST_ORDER[key] ? null : nextOrder,
      page: null,
    });
  };

  const filters = { status, severity, priority };
  const sort = { key: sortKey, order };

  const handleCreate = async (values) => {
    const created = await bugsApi.create(values);
    setShowForm(false);
    navigate(`/bugs/${created.id}`);
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
  const lastShown = firstShown + Math.max(items.length - 1, 0);
  const filtered = Boolean(search || filters.status || filters.severity || filters.priority);

  return (
    <main className="page">
      <div className="page-header">
        <h1>Bugs</h1>
        <button type="button" className="button button-primary" onClick={() => setShowForm(true)}>
          + Report bug
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search title and description"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search title and description"
        />
        <select value={filters.status} onChange={setFilter('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          {BUG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.severity} onChange={setFilter('severity')} aria-label="Filter by severity">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={setFilter('priority')} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {BUG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div role="status" className="notice-slot">
        {deleted && (
          <p className="notice">
            Deleted bug #{deleted.id} “{deleted.title}”.
          </p>
        )}
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          Could not load bugs: {loadError}{' '}
          <button type="button" className="link-button" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
        </p>
      )}

      <div className={`table-wrap${loading ? ' is-loading' : ''}`} aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              {sortHeader('title', 'Title')}
              {sortHeader('severity', 'Severity')}
              {sortHeader('priority', 'Priority')}
              <th>Status</th>
              {sortHeader('updated', 'Updated')}
            </tr>
          </thead>
          <tbody>
            {items.map((bug) => (
              <tr key={bug.id}>
                <td className="num muted">{bug.id}</td>
                <td className="title-cell">
                  {/* Remember this list's filters, so "← Bugs" on the bug's page comes back to them. */}
                  <Link to={`/bugs/${bug.id}`} state={{ listSearch: location.search }}>{bug.title}</Link>
                </td>
                <td><SeverityBadge severity={bug.severity} /></td>
                <td><span className={`priority priority-${bug.priority}`}>{bug.priority}</span></td>
                <td><span className={`status-text status-${bug.status}`}>{bug.status}</span></td>
                <td className="nowrap">{formatDate(bug.updatedAt)}</td>
              </tr>
            ))}
            {!result && loading && (
              <tr><td colSpan={6} className="empty">Loading…</td></tr>
            )}
            {result && items.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {filtered ? 'No bugs match your search or filters.' : 'No bugs reported yet. Report the first one.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="pagination">
          <span role="status">Showing {firstShown}–{lastShown} of {result.total}</span>
          {result.totalPages > 1 && (
            <div className="pagination-buttons">
              <button type="button" className="button" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                ← Previous
              </button>
              <span>Page {result.page} of {result.totalPages}</span>
              <button type="button" className="button" onClick={() => setPage(page + 1)} disabled={page >= result.totalPages}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <Modal title="Report a bug" onClose={guard(closeForm)} busy={formBusy}>
          <BugForm
            onSubmit={handleCreate}
            onCancel={guard(closeForm)}
            onDirtyChange={setDirty}
            onBusyChange={setFormBusy}
          />
        </Modal>
      )}
    </main>
  );
}
