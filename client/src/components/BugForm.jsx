import { useEffect, useRef, useState } from 'react';
import { BUG_PRIORITIES, SEVERITIES } from '../constants.js';
import { useSettings } from '../settings.jsx';

// Steps get their own ids, so removing one never mixes up which input has focus.
let nextStepId = 1;
const newStep = (text = '') => ({ id: nextStepId++, text });

// Report or edit a bug. Required: title, steps, expected, actual, severity, priority.
// Status isn't here: new bugs start open, and status changes happen on the bug's page.
// onDirtyChange(true/false) reports whether anything differs from how the form started.
// onBusyChange(true/false) reports while a save is on its way, so the dialog can't be closed then.
export default function BugForm({ initial, onSubmit, onCancel, onDirtyChange, onBusyChange }) {
  // A new bug starts with the severity chosen in Settings ("Default severity for new bugs").
  const defaultSeverity = useSettings()?.settings?.defaultSeverityForNewBugs ?? '';
  const [start] = useState(() => ({
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    severity: initial?.severity ?? defaultSeverity,
    priority: initial?.priority ?? 'medium',
    environment: initial?.environment ?? '',
    steps: (initial?.steps?.length ? initial.steps : ['']).map((text) => newStep(text)),
    expected: initial?.expected ?? '',
    actual: initial?.actual ?? '',
  }));
  const [values, setValues] = useState(start);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusStepId, setFocusStepId] = useState(null);
  const stepRefs = useRef(new Map());

  const comparable = (v) => JSON.stringify({ ...v, steps: v.steps.map((s) => s.text) });
  useEffect(() => {
    onDirtyChange?.(comparable(values) !== comparable(start));
  }, [values, start, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(saving);
  }, [saving, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // Focus a step that was just added, or the one before a removed step.
  useEffect(() => {
    if (focusStepId !== null) stepRefs.current.get(focusStepId)?.focus();
  }, [focusStepId, values.steps]);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const setStep = (id) => (e) =>
    setValues((v) => ({ ...v, steps: v.steps.map((s) => (s.id === id ? { ...s, text: e.target.value } : s)) }));
  const addStep = () => {
    const step = newStep();
    setValues((v) => ({ ...v, steps: [...v.steps, step] }));
    setFocusStepId(step.id);
  };
  const removeStep = (id) => {
    const index = values.steps.findIndex((s) => s.id === id);
    const remaining = values.steps.filter((s) => s.id !== id);
    setValues((v) => ({ ...v, steps: remaining }));
    setFocusStepId(remaining[Math.max(0, index - 1)].id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({ ...values, steps: values.steps.map((s) => s.text) });
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
          Priority
          <select value={values.priority} onChange={set('priority')} required>
            {BUG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <label>
        <span>Description <span className="optional">(optional)</span></span>
        <textarea value={values.description} onChange={set('description')} rows={2} maxLength={5000} />
      </label>

      <fieldset>
        <legend>Steps to reproduce</legend>
        <ol className="steps-input">
          {values.steps.map((step, i) => (
            <li key={step.id}>
              <input
                ref={(el) => (el ? stepRefs.current.set(step.id, el) : stepRefs.current.delete(step.id))}
                value={step.text}
                onChange={setStep(step.id)}
                required
                maxLength={500}
                aria-label={`Step ${i + 1}`}
              />
              {values.steps.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => removeStep(step.id)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
        {values.steps.length < 50 && (
          <button type="button" className="link-button add-step" onClick={addStep}>+ Add step</button>
        )}
      </fieldset>

      <label>
        Expected
        <textarea value={values.expected} onChange={set('expected')} rows={2} required maxLength={2000} />
      </label>
      <label>
        Actual
        <textarea value={values.actual} onChange={set('actual')} rows={2} required maxLength={2000} />
      </label>
      <label>
        <span>Environment <span className="optional">(optional: browser, device, where it happened)</span></span>
        <input value={values.environment} onChange={set('environment')} maxLength={200} />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="button" className="button" onClick={onCancel} disabled={saving} aria-busy={saving}>Cancel</button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Report bug'}
        </button>
      </div>
    </form>
  );
}
