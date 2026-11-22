// Every keyboard shortcut in the app, in one place. The key handler (components/KeyboardShortcuts.jsx)
// runs shortcuts from this list, and the "?" help dialog is drawn from it, so they always match.
//
// keys:   what to press. "Mod" is ⌘ on a Mac and Ctrl elsewhere, held with the next key.
//         Two letters without "Mod" (like ["G", "B"]) are pressed one after the other.
// also:   other keys that do the same (e.g. "/", the same key as "?" without Shift).
// action: "openSearch" | "openHelp", or `to` for a page to go to.
// handledByDialogs: listed in the help, but each dialog handles the key itself.
export const SHORTCUTS = [
  { group: 'General', keys: ['Mod', 'K'], description: 'Quick search: test cases, bugs and suites', action: 'openSearch' },
  { group: 'General', keys: ['?'], also: [['/']], description: 'Show keyboard shortcuts', action: 'openHelp' },
  { group: 'General', keys: ['Esc'], description: 'Close quick search or any dialog', handledByDialogs: true },
  { group: 'Go to', keys: ['G', 'D'], description: 'Dashboard', to: '/dashboard' },
  { group: 'Go to', keys: ['G', 'T'], description: 'Test cases', to: '/test-cases' },
  { group: 'Go to', keys: ['G', 'S'], description: 'Test suites', to: '/test-suites' },
  { group: 'Go to', keys: ['G', 'R'], description: 'Test runs', to: '/test-runs' },
  { group: 'Go to', keys: ['G', 'B'], description: 'Bugs', to: '/bugs' },
];

// How long after the first key of a pair (like G) the second key still counts.
export const SEQUENCE_TIMEOUT_MS = 1500;

// Browsers report "macOS" (newer) or "MacIntel" (older), so the check ignores upper/lower case.
export const isMac = () => /mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');

// "Mod" -> "⌘" or "Ctrl" for showing to people.
export const keyLabel = (key) => (key === 'Mod' ? (isMac() ? '⌘' : 'Ctrl') : key);

// True while the person is typing somewhere, so plain-key shortcuts must not fire:
// text fields, text areas, dropdowns and anything editable. Checkboxes, radios and buttons don't count.
export function isTypingTarget(element) {
  if (!element || element === document.body) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(element.type);
}

// The first keys of two-key shortcuts ("G"), and what can follow each one.
export function sequenceStarts() {
  const starts = new Map();
  for (const s of SHORTCUTS) {
    if (s.keys.length === 2 && s.keys[0] !== 'Mod' && !s.handledByDialogs) {
      if (!starts.has(s.keys[0])) starts.set(s.keys[0], []);
      starts.get(s.keys[0]).push(s);
    }
  }
  return starts;
}
