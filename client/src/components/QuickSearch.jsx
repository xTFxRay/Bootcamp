import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { searchApi } from '../api.js';
import Modal from './Modal.jsx';
import SeverityBadge from './SeverityBadge.jsx';

// Quick search (⌘K / Ctrl+K): one box that finds test cases, bugs and test suites.
// ↑ ↓ move through the results, Enter opens one, Esc closes.

const GROUPS = [
  { key: 'testCases', label: 'Test cases', href: (r) => `/test-cases?edit=${r.id}`, title: (r) => r.title },
  { key: 'bugs', label: 'Bugs', href: (r) => `/bugs/${r.id}`, title: (r) => r.title },
  { key: 'suites', label: 'Test suites', href: (r) => `/test-suites/${r.id}`, title: (r) => r.name },
];

export default function QuickSearch({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);
  const listRef = useRef(null);

  // Search 200 ms after typing pauses; replies to older searches are ignored.
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      latest.current += 1; // ignore any search still on its way
      setResult(null);
      setError('');
      setLoading(false);
      return undefined;
    }
    const id = ++latest.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchApi.search(text);
        if (id !== latest.current) return;
        setResult(data);
        setError('');
        setActive(0);
      } catch (err) {
        if (id === latest.current) setError(err.message);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Every result in display order, so ↑ ↓ can move across the groups.
  const flat = result ? GROUPS.flatMap((g) => result[g.key].items.map((item) => ({ group: g, item }))) : [];

  const open = (entry) => {
    onClose();
    navigate(entry.group.href(entry.item));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      open(flat[active]);
    }
  };

  // Keep the highlighted result in view.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const optionId = (i) => `quick-search-option-${i}`;
  let index = -1;

  return (
    <Modal title="Quick search" onClose={onClose}>
      <input
        className="quick-search-input"
        type="search"
        autoFocus
        placeholder="Search test cases, bugs and suites…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={flat.length > 0}
        aria-controls="quick-search-results"
        aria-activedescendant={flat.length ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label="Search test cases, bugs and suites"
        maxLength={100}
      />

      <div className="quick-search-body" ref={listRef}>
        {!query.trim() && <p className="quick-search-empty">Type part of a title, a suite's feature, or a bug number like #3.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {result && !error && flat.length === 0 && !loading && (
          <p className="quick-search-empty">Nothing matches “{result.query}”.</p>
        )}
        <div id="quick-search-results" role="listbox" aria-label="Results">
          {result &&
            GROUPS.map((g) => {
              const { items, total } = result[g.key];
              if (!items.length) return null;
              return (
                <div key={g.key} role="group" aria-label={g.label} className="quick-search-group">
                  <div className="quick-search-group-label" aria-hidden="true">
                    {g.label}
                    {total > items.length && <span className="muted"> · {items.length} of {total}</span>}
                  </div>
                  {items.map((item) => {
                    index += 1;
                    const i = index;
                    return (
                      <div
                        key={item.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        className={`quick-search-option${i === active ? ' is-active' : ''}`}
                        onMouseMove={() => setActive(i)}
                        onClick={() => open({ group: g, item })}
                      >
                        <span className="quick-search-title">
                          <span className="muted">#{item.id}</span> {g.title(item)}
                        </span>
                        <span className="quick-search-meta">
                          {item.severity && <SeverityBadge severity={item.severity} />}
                          {item.feature && <span className="muted small">{item.feature}</span>}
                          <span className={`status-text status-${item.status} small`}>{item.status}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
        </div>
      </div>

      <p className="quick-search-footer muted small">
        <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
      </p>
    </Modal>
  );
}
