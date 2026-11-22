import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { settingsApi } from './api.js';

// The user's settings (Settings page), loaded once when the app starts and shared with every page.
// It also applies the theme: <html data-theme="light|dark">, which index.css uses for its colours.

const THEME_KEY = 'bootcamp-theme'; // remembered in the browser so the next page load starts in the right theme
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// "system" follows the computer's light/dark setting.
const resolveTheme = (theme) => (theme === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : theme);

function readSavedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return ['light', 'dark', 'system'].includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null); // null until loaded
  const [options, setOptions] = useState(null);
  const [loadError, setLoadError] = useState('');
  const theme = settings?.theme ?? readSavedTheme();

  const load = useCallback(async () => {
    try {
      const data = await settingsApi.get();
      setSettings(data.settings);
      setOptions(data.options);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Apply the theme now, and again whenever the computer switches light/dark while on "system".
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
    };
    apply();
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private windows can refuse storage; the theme still applies, it just isn't remembered.
    }
    if (theme !== 'system' || !darkQuery) return undefined;
    darkQuery.addEventListener('change', apply);
    return () => darkQuery.removeEventListener('change', apply);
  }, [theme]);

  // Called by the Settings page after a successful save.
  const saved = useCallback((data) => {
    setSettings(data.settings);
    setOptions(data.options);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, options, loadError, reload: load, saved }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
