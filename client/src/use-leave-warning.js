import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

// While `active` is true, asks before the user leaves the page and loses unsaved text:
// - in-app links and the browser's Back and Forward buttons get a "Leave this page?" prompt;
// - reloading or closing the tab gets the browser's own "Leave site?" prompt.
export function useLeaveWarning(active, message) {
  // A navigation the page itself chose (e.g. after deleting) passes state { skipLeaveWarning: true }.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname && !nextLocation.state?.skipLeaveWarning
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // the browser shows its own wording
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [active]);
}
