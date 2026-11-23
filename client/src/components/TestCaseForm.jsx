import { useEffect, useState } from 'react';
import { SEVERITIES, TEST_CASE_STATUSES } from '../constants.js';

const EMPTY = {
  title: '',
  preconditions: '',
  steps: [''],
  expectedResult: '',
  severity: '',
  status: 'draft',
};

// Add or edit a test case. All fields are required except preconditions.
// onDirtyChange(true/false) reports whether anything differs from how the form started.
export default function TestCaseForm({ initial, onSubmit, onCancel, onDirtyChange }) {
  const [start] = useState(() =>
    initial
      ? { ...initial, preconditions: initial.preconditions ?? '', steps: initial.steps.length ? initial.steps : [''] }
      : EMPTY
  );
  const [values, setValues] = useState(start);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(values) !== JSON.stringify(start));
  }, [values, start, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusStep, setFocusStep] = useState(null); // index of a just-added step

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const setStep = (index) => (e) =>
    setValues((v) => ({ ...v, steps: v.steps.map((s, i) => (i === index ? e.target.value : s)) }));
  const addStep = () => {
    setFocusStep(values.steps.length);
    setValues((v) => ({ ...v, steps: [...v.steps, ''] }));
  };
  const removeStep = (index) => setValues((v) => ({ ...v, steps: v.steps.filter((_, i) => i !== index) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        title: values.title,
        preconditions: values.preconditions,
        steps: values.steps,
        expectedResult: values.expectedResult,
        severity: values.severity,
        status: values.status,
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Title
        <input value={values.title} onChange={set('title')} required maxLength={200} autoFocus />
      </label>

      <div className="form-row">
        <label>
          Severity
          <select value={values.severity} onChange={set('severity')} required>
            <option value="" disabled>Choose severity</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={values.status} onChange={set('status')} required>
            {TEST_CASE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <label>
        <span>Preconditions <span className="optional">(optional)</span></span>
        <textarea value={values.preconditions} onChange={set('preconditions')} rows={2} />
      </label>

      <fieldset>
        <legend>Steps</legend>
        <ol className="steps-input">
          {values.steps.map((step, i) => (
            <li key={i}>
              <input
                value={step}
                onChange={setStep(i)}
                required
                aria-label={`Step ${i + 1}`}
                autoFocus={i === focusStep}
              />
              {values.steps.length > 1 && (
                <button type="button" className="icon-button" onClick={() => removeStep(i)} aria-label={`Remove step ${i + 1}`}>✕</button>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="link-button" onClick={addStep}>+ Add step</button>
      </fieldset>

      <label>
        Expected result
        <textarea value={values.expectedResult} onChange={set('expectedResult')} rows={3} required />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add test case'}
        </button>
      </div>
    </form>
  );
}
