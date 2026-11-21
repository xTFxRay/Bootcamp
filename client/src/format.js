const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// "Nov 20, 2026, 5:11 PM" in the viewer's own language and time zone.
export const formatDate = (iso) => dateFormat.format(new Date(iso));

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

// "just now", "5 minutes ago", "yesterday", "3 days ago".
export function formatRelative(iso, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

// 42000 -> "42s", 125000 -> "2m 5s", 3720000 -> "1h 2m".
export function formatDuration(ms) {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Text for the "Delete test suite?" dialog.
export function suiteDeleteMessage(name, caseCount) {
  const kept =
    caseCount === 0 ? '' : caseCount === 1 ? ' Its 1 test case is kept.' : ` Its ${caseCount} test cases are kept.`;
  return `“${name}” will be deleted.${kept} This can't be undone.`;
}
