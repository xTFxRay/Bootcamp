// A whole number above 0 (from a number or text like "12"), or null.
// "1.0", "1e0", "abc" and "-1" all give null.
export function toId(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

// Returns "<Label> must be text" for the first field that's present but not text, or null.
// fields: [['name', 'Name'], ['feature', 'Feature']]
export function textTypeError(body, fields) {
  for (const [field, label] of fields) {
    const value = body[field];
    if (value !== undefined && value !== null && typeof value !== 'string') return `${label} must be text`;
  }
  return null;
}
