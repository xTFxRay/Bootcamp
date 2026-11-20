import { useCallback, useRef } from 'react';

// Stops a form dialog from closing and losing typed changes without asking.
//
//   const { setDirty, guard } = useDiscardGuard();
//   <Modal onClose={guard(closeModal)}>
//     <SomeForm onDirtyChange={setDirty} onCancel={guard(closeModal)} ... />
//
// guard(fn) returns a function that asks "Discard your changes?" first when the form
// has unsaved changes, and only calls fn if the user agrees.
export function useDiscardGuard() {
  const dirtyRef = useRef(false);

  const setDirty = useCallback((dirty) => {
    dirtyRef.current = dirty;
  }, []);

  const guard = useCallback(
    (fn) => () => {
      if (dirtyRef.current && !window.confirm('Discard your changes? What you typed will be lost.')) return;
      dirtyRef.current = false;
      fn();
    },
    []
  );

  return { setDirty, guard };
}
