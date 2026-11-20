const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// "Nov 20, 2026, 5:11 PM" in the viewer's own language and time zone.
export const formatDate = (iso) => dateFormat.format(new Date(iso));

// Text for the "Delete test suite?" dialog.
export function suiteDeleteMessage(name, caseCount) {
  const kept =
    caseCount === 0 ? '' : caseCount === 1 ? ' Its 1 test case is kept.' : ` Its ${caseCount} test cases are kept.`;
  return `“${name}” will be deleted.${kept} This can't be undone.`;
}
