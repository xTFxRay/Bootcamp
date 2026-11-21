import { useState } from 'react';

const NAME_KEY = 'bootcamp.runBy';

// Remembered in this browser only, so the name is filled in next time. Storage can be
// unavailable (private windows, blocked site data), so every access is guarded.
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (name) => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered this time; the run still starts.
  }
};

// Starts a run of a suite. onStart(createdBy) creates it; errors are shown in the form.
export default function NewRunForm({ suiteName, caseCount, onStart, onCancel, onBusyChange }) {
  const [name, setName] = useState(readName);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStarting(true);
    onBusyChange?.(true);
    try {
      saveName(name.trim());
      await onStart(name.trim());
    } catch (err) {
      setError(err.message);
      setStarting(false);
      onBusyChange?.(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <p className="hint">
        A run takes a copy of the {caseCount} test cases in “{suiteName}” as they are now. Editing them later won't change this run.
      </p>
      <label>
        <span>Run by <span className="optional">(optional, your name)</span></span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel} disabled={starting}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={starting}>
          {starting ? 'Starting…' : '▶ Start run'}
        </button>
      </div>
    </form>
  );
}
