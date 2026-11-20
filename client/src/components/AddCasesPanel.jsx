import { useEffect, useState } from 'react';
import { testCasesApi } from '../api.js';
import SeverityBadge from './SeverityBadge.jsx';

// Search all test cases and add them to a suite one at a time.
export default function AddCasesPanel({ inSuiteIds, onAdd, onDone }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    testCasesApi
      .list({ search, page, sort: 'updated', order: 'desc' })
      .then((data) => !cancelled && (setResult(data), setError('')))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [search, page]);

  const handleAdd = async (testCase) => {
    setAddingId(testCase.id);
    setError('');
    try {
      await onAdd(testCase);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="add-cases">
      <input
        type="search"
        className="add-cases-search"
        placeholder="Search test cases by title"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        aria-label="Search test cases by title"
        autoFocus
      />

      {error && <p className="form-error" role="alert">{error}</p>}

      <ul className="add-cases-list">
        {result?.items.map((tc) => {
          const added = inSuiteIds.includes(tc.id);
          return (
            <li key={tc.id}>
              <span className="case-title">{tc.title}</span>
              <SeverityBadge severity={tc.severity} />
              <button
                type="button"
                className="button button-small"
                disabled={added || addingId !== null}
                onClick={() => handleAdd(tc)}
                aria-label={added ? `"${tc.title}" is already in this suite` : `Add "${tc.title}"`}
              >
                {added ? '✓ In suite' : addingId === tc.id ? 'Adding…' : 'Add'}
              </button>
            </li>
          );
        })}
        {result && result.items.length === 0 && (
          <li className="empty">{search ? 'No test cases match your search.' : 'There are no test cases yet.'}</li>
        )}
      </ul>

      <div className="form-actions add-cases-footer">
        {result && result.totalPages > 1 && (
          <div className="pagination-buttons">
            <button type="button" className="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              ← Previous
            </button>
            <span>Page {result.page} of {result.totalPages}</span>
            <button type="button" className="button" onClick={() => setPage((p) => p + 1)} disabled={page >= result.totalPages}>
              Next →
            </button>
          </div>
        )}
        <button type="button" className="button button-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
