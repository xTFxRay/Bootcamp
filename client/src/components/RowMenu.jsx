import { useEffect, useRef, useState } from 'react';

// The "⋯" button on each table row, with Edit and Delete.
// The list is positioned against the window, so the table's edges never cut it off.
export default function RowMenu({ label, onEdit, onDelete }) {
  const [position, setPosition] = useState(null); // null when closed
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  const close = () => setPosition(null);

  const toggle = () => {
    if (position) return close();
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 90;
    const openUp = rect.bottom + menuHeight > window.innerHeight;
    setPosition({
      right: window.innerWidth - rect.right,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (!position) return;
    const handleClick = (e) => {
      if (!listRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) close();
    };
    const handleKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [position]);

  const choose = (action) => {
    // Put focus back on ⋯ first, so a dialog opened by the action returns focus there when it closes.
    buttonRef.current?.focus();
    close();
    action();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={toggle}
      >
        ⋯
      </button>
      {position && (
        <div ref={listRef} className="row-menu-list" role="menu" style={position}>
          <button type="button" role="menuitem" onClick={() => choose(onEdit)}>✎ Edit</button>
          <button type="button" role="menuitem" className="danger" onClick={() => choose(onDelete)}>🗑 Delete</button>
        </div>
      )}
    </>
  );
}
