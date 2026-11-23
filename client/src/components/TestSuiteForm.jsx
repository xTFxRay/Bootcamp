import { useEffect, useState } from 'react';
import { TEST_SUITE_STATUSES } from '../constants.js';

// Create or edit a test suite's name, feature and status.
// onDirtyChange(true/false) reports whether anything differs from how the form started.
export default function TestSuiteForm({ initial, onSubmit, onCancel, onDirtyChange }) {
  const [start] = useState(() => ({
    name: initial?.name ?? '',
    feature: initial?.feature ?? '',
    status: initial?.status ?? 'draft',
  }));
  const [values, setValues] = useState(start);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(values) !== JSON.stringify(start));
  }, [values, start, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={values.name} onChange={set('name')} required maxLength={120} autoFocus />
      </label>
      <label>
        <span>Feature <span className="optional">(what this suite tests, e.g. login)</span></span>
        <input value={values.feature} onChange={set('feature')} required maxLength={80} />
      </label>
      <label>
        Status
        <select value={values.status} onChange={set('status')} required>
          {TEST_SUITE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Create suite'}
        </button>
      </div>
    </form>
  );
}
