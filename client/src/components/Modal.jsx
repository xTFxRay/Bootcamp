import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A centered dialog over a dimmed page. Closes on Escape, the ✕ button, or a click outside it.
// Keyboard focus moves into the dialog when it opens, stays inside while it's open,
// and goes back to whatever was focused before (usually the button that opened it) when it closes.
export default function Modal({ title, onClose, children }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;

    // A field with autoFocus inside the dialog may already have focus; otherwise focus the first control.
    if (!dialog.contains(document.activeElement)) {
      const controls = [...dialog.querySelectorAll(FOCUSABLE)];
      // Prefer the first control after the ✕ close button.
      (controls[1] ?? controls[0] ?? dialog).focus();
    }

    const handleKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  // Keep Tab and Shift+Tab inside the dialog.
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
