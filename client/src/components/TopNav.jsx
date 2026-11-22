import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { keyLabel } from '../shortcuts.js';

// The app's sections, in menu order. A link stays highlighted on its pages below it too
// (e.g. "Bugs" on /bugs/24, "Test cases" on /test-cases/import).
export const NAV_SECTIONS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/test-cases', label: 'Test cases' },
  { to: '/test-suites', label: 'Test suites' },
  { to: '/test-runs', label: 'Test runs' },
  { to: '/bugs', label: 'Bugs' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

// Below this width the links fold into a "Menu" button (matches the 768px rule in index.css).
const NARROW = '(max-width: 767px)';

// The top bar on every page: name, sections, search and shortcuts help.
// On narrow screens the sections open from a Menu button; the menu closes when a page opens,
// on Escape, on a click outside it, or when the window gets wide again.
export default function TopNav({ onSearch, onHelp }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const barRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e) => !barRef.current?.contains(e.target) && setOpen(false);
    const wide = window.matchMedia(NARROW);
    const onResize = () => !wide.matches && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    wide.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      wide.removeEventListener('change', onResize);
    };
  }, [open]);

  return (
    <header className={`topbar${open ? ' is-open' : ''}`} ref={barRef}>
      <a className="skip-link" href="#content">Skip to main content</a>
      <div className="topbar-inner">
        <Link to="/" className="brand">Bootcamp App</Link>

        <nav id="main-nav" className="topbar-nav" aria-label="Main">
          {NAV_SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to}>{s.label}</NavLink>
          ))}
        </nav>

        <div className="topbar-tools">
          <button type="button" className="topbar-search" onClick={onSearch} aria-label="Search">
            <span aria-hidden="true">⌕</span>
            <span className="topbar-search-label">Search</span>
            <kbd>{keyLabel('Mod')}</kbd><kbd>K</kbd>
          </button>
          <button type="button" className="icon-button topbar-help" onClick={onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            ?
          </button>
          <button
            ref={buttonRef}
            type="button"
            className="topbar-menu-button"
            aria-expanded={open}
            aria-controls="main-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="menu-icon" aria-hidden="true"><span /><span /><span /></span>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>
    </header>
  );
}
