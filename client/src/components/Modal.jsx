import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A centered dialog over a dimmed page. Closes on Escape, the ✕ button, or a click outside it.
// Keyboard focus moves into the dialog when it opens, stays inside while it's open,
// and goes back to whatever was focused before (usually the button that opened it) when it closes.
// While busy (e.g. its form is saving), Escape, ✕ and clicking outside do nothing, so a save
// that's already on its way can't look discarded.
export default function Modal({ title, onClose, busy = false, children }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = busy ? () => {} : onClose;
  const requestClose = () => closeRef.current();

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;

    // A field with autoFocus inside the dialog may already have focus; otherwise focus the first control.
    if (!dialog.contains(document.activeElement)) {
      const controls = [...dialog.querySelectorAll(FOCUSABLE)];
      // Prefer the first control after the ✕ close button.
      (controls[1] ?? controls[0] ?? dialog).focus();
    }

    const handleKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      // If focus fell out of the dialog (e.g. its focused button was disabled while saving),
      // Tab brings it back inside instead of moving to the page behind.
      if (e.key === 'Tab' && !dialog.contains(document.activeElement)) {
        e.preventDefault();
        (dialog.querySelector(FOCUSABLE) ?? dialog).focus();
      }
    };
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
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          {/* aria-disabled rather than disabled, so a focused ✕ keeps its focus while saving */}
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label="Close"
            aria-disabled={busy}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
