import { useEffect, useMemo, useState } from 'react';
import { settingsApi } from '../api.js';
import { useSettings } from '../settings.jsx';
import { useLeaveWarning } from '../use-leave-warning.js';

const THEME_CHOICES = [
  { value: 'system', label: 'System', hint: "Follows your computer's light or dark setting" },
  { value: 'light', label: 'Light', hint: 'Dark text on a light background' },
  { value: 'dark', label: 'Dark', hint: 'Light text on a dark background' },
];

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Every time zone the browser knows, grouped by region ("Europe", "America", ...).
function timeZoneGroups() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [browserTimeZone];
  const groups = new Map();
  for (const zone of zones) {
    const region = zone.includes('/') ? zone.split('/')[0] : 'Other';
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(zone);
  }
  return [...groups.entries()];
}

const toDraft = (s) => ({
  theme: s.theme,
  defaultSeverityForNewBugs: s.defaultSeverityForNewBugs,
  defaultPageSize: s.defaultPageSize,
  timezone: s.timezone ?? '', // '' = the browser's time zone
  autoGenerateReportAfterRun: s.autoGenerateReportAfterRun,
});

export default function SettingsPage() {
  const { settings, options, loadError, reload, saved } = useSettings();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null); // { text, id }
  const zoneGroups = useMemo(timeZoneGroups, []);

  // Fill the form once the settings have loaded.
  useEffect(() => {
    if (settings && !draft) setDraft(toDraft(settings));
  }, [settings, draft]);

  const dirty = Boolean(draft && settings) && JSON.stringify(draft) !== JSON.stringify(toDraft(settings));
  useLeaveWarning(dirty && !saving, 'Leave without saving? Your changes to the settings will be lost.');

  if (loadError && !settings) {
    return (
      <main className="page page-narrow">
        <h1>Settings</h1>
        <p className="form-error" role="alert">Couldn't load your settings: {loadError}</p>
        <button type="button" className="button" onClick={reload}>Try again</button>
      </main>
    );
  }
  if (!draft) return <main className="page page-narrow"><h1>Settings</h1><p className="page-loading" role="status">Loading…</p></main>;

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setDraft((d) => ({ ...d, [key]: key === 'defaultPageSize' ? Number(value) : value }));
    setNotice(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await settingsApi.update({ ...draft, timezone: draft.timezone || null });
      saved(data); // applies the theme and the other settings across the app
      setDraft(toDraft(data.settings));
      setNotice({ text: 'Settings saved.', id: Date.now() });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const notUsedYet = <span className="settings-soon">Not used by the app yet</span>;

  return (
    <main className="page page-narrow">
      <h1>Settings</h1>
      <form className="settings-form" onSubmit={handleSubmit}>
        <fieldset className="settings-group">
          <legend>Appearance</legend>
          <div className="settings-field">
            <span className="settings-label" id="theme-label">Theme</span>
            <div className="theme-choices" role="radiogroup" aria-labelledby="theme-label">
              {THEME_CHOICES.map((t) => (
                <label key={t.value} className={`theme-choice${draft.theme === t.value ? ' is-selected' : ''}`}>
                  <input type="radio" name="theme" value={t.value} checked={draft.theme === t.value} onChange={set('theme')} />
                  <span className={`theme-swatch theme-swatch-${t.value}`} aria-hidden="true" />
                  <span className="theme-choice-label">{t.label}</span>
                  <span className="theme-choice-hint">{t.hint}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="settings-group">
          <legend>Bugs</legend>
          <label className="settings-field">
            <span className="settings-label">Default severity for new bugs</span>
            <select value={draft.defaultSeverityForNewBugs} onChange={set('defaultSeverityForNewBugs')}>
              {options.severities.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="settings-hint">Already chosen when you open “Report a bug”. You can still change it for each bug.</span>
          </label>
        </fieldset>

        <fieldset className="settings-group">
          <legend>Lists</legend>
          <label className="settings-field">
            <span className="settings-label">Default page size</span>
            <select value={draft.defaultPageSize} onChange={set('defaultPageSize')}>
              {options.pageSizes.map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
            <span className="settings-hint">How many rows the lists show per page. {notUsedYet}</span>
          </label>
        </fieldset>

        <fieldset className="settings-group">
          <legend>Date and time</legend>
          <label className="settings-field">
            <span className="settings-label">Time zone</span>
            <select value={draft.timezone} onChange={set('timezone')}>
              <option value="">Browser default ({browserTimeZone})</option>
              {zoneGroups.map(([region, zones]) => (
                <optgroup key={region} label={region}>
                  {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
                </optgroup>
              ))}
            </select>
            <span className="settings-hint">Times are shown in your browser's time zone for now. {notUsedYet}</span>
          </label>
        </fieldset>

        <fieldset className="settings-group">
          <legend>Test runs</legend>
          <label className="settings-check">
            <input type="checkbox" checked={draft.autoGenerateReportAfterRun} onChange={set('autoGenerateReportAfterRun')} />
            <span>
              <span className="settings-label">Generate a report automatically when a run finishes</span>
              <span className="settings-hint">Otherwise use “Generate report” on the run's page. {notUsedYet}</span>
            </span>
          </label>
        </fieldset>

        <div className="settings-actions">
          <button type="submit" className="button button-primary" disabled={!dirty || saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {dirty && !saving && (
            <button type="button" className="button" onClick={() => { setDraft(toDraft(settings)); setError(''); }}>
              Undo changes
            </button>
          )}
          <span role="status" className="settings-status">
            {notice && !dirty && <span key={notice.id} className="settings-saved">✓ {notice.text}</span>}
            {dirty && !saving && <span className="muted small">You have unsaved changes.</span>}
          </span>
        </div>
        {error && <p className="form-error" role="alert">Couldn't save: {error}</p>}
      </form>
    </main>
  );
}
