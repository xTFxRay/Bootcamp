import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { SEQUENCE_TIMEOUT_MS, SHORTCUTS, isMac, isTypingTarget, keyLabel, sequenceStarts } from '../shortcuts.js';
import Modal from './Modal.jsx';
import QuickSearch from './QuickSearch.jsx';

// Listens for the shortcuts in shortcuts.js and shows the quick search and help dialogs.
// `dialog` / `setDialog` come from App, so the top bar's search button can open quick search too.
export default function KeyboardShortcuts({ dialog, setDialog }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(null); // first key of a pair, e.g. "G", while waiting for the second
  const pendingTimer = useRef(null);

  useEffect(() => {
    const starts = sequenceStarts();
    const clearPending = () => {
      clearTimeout(pendingTimer.current);
      setPending(null);
    };
    // Is the held modifier the right one for "Mod" here? ⌘ on a Mac, Ctrl elsewhere.
    const mac = isMac();
    const isMacMod = (e) => (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
    const run = (shortcut) => {
      if (shortcut.action) setDialog(shortcut.action === 'openSearch' ? 'search' : 'help');
      else if (shortcut.to) navigate(shortcut.to);
    };

    const handleKeyDown = (e) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      // Never while typing in a field (including quick search's own box), and never over an open dialog:
      // a dialog handles its own keys (Esc, Tab, Enter).
      if (isTypingTarget(e.target) || document.querySelector('[role="dialog"]')) {
        clearPending();
        return;
      }

      // ⌘K / Ctrl+K style shortcuts.
      if (e.metaKey || e.ctrlKey) {
        if (e.altKey || e.shiftKey) return;
        const mod = isMacMod(e) ? SHORTCUTS.find((s) => s.keys[0] === 'Mod' && s.keys[1].toLowerCase() === e.key.toLowerCase()) : null;
        if (mod) {
          e.preventDefault(); // e.g. Ctrl+K would otherwise focus the browser's address bar
          clearPending();
          run(mod);
        }
        return;
      }
      if (e.altKey) return;

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;

      // Second key of a pair: G then B, and so on.
      if (pending) {
        const match = (starts.get(pending) ?? []).find((s) => s.keys[1] === key);
        clearPending();
        if (match) {
          e.preventDefault();
          run(match);
        }
        return;
      }

      // First key of a pair: wait a moment for the second one.
      if (starts.has(key)) {
        e.preventDefault();
        setPending(key);
        clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => setPending(null), SEQUENCE_TIMEOUT_MS);
        return;
      }

      // One-key shortcuts, like "?" (or "/", the same key without Shift).
      const single = SHORTCUTS.find(
        (s) => !s.handledByDialogs && [s.keys, ...(s.also ?? [])].some((keys) => keys.length === 1 && keys[0] === e.key)
      );
      if (single) {
        e.preventDefault();
        run(single);
      }
    };


    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(pendingTimer.current);
    };
  }, [navigate, pending, setDialog]);

  const pendingOptions = pending ? sequenceStarts().get(pending) ?? [] : [];

  return (
    <>
      {pending && (
        <div className="shortcut-pending" role="status">
          <kbd>{pending}</kbd> then{' '}
          {pendingOptions.map((s, i) => (
            <span key={s.keys.join('')}>
              {i > 0 && ', '}
              <kbd>{s.keys[1]}</kbd> {s.description}
            </span>
          ))}
        </div>
      )}
      {dialog === 'search' && <QuickSearch onClose={() => setDialog(null)} />}
      {dialog === 'help' && <ShortcutHelp onClose={() => setDialog(null)} />}
    </>
  );
}

function Keys({ keys }) {
  const pair = keys.length === 2 && keys[0] !== 'Mod';
  return (
    <span className="shortcut-keys">
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && <span className="shortcut-joiner">{pair ? 'then' : '+'}</span>}
          <kbd>{keyLabel(k)}</kbd>
        </span>
      ))}
    </span>
  );
}

// The "?" dialog: every shortcut from shortcuts.js, grouped. Nothing here is written by hand.
function ShortcutHelp({ onClose }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      {groups.map((group) => (
        <section key={group} className="shortcut-group">
          <h3>{group}</h3>
          <dl>
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <div key={s.keys.join('+')} className="shortcut-row">
                <dt>{s.description}</dt>
                <dd>
                  {[s.keys, ...(s.also ?? [])].map((keys, i) => (
                    <span key={keys.join('+')}>
                      {i > 0 && <span className="shortcut-joiner">or</span>}
                      <Keys keys={keys} />
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="hint">Shortcuts don't work while you're typing in a field, so typing “g”, “/” or “?” is always safe.</p>
    </Modal>
  );
}
