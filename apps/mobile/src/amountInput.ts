/** iOS/Android decimal keyboards may use a comma as the decimal separator. */
export function normalizeDecimalSeparator(value: string): string {
  return /^\d*,\d*$/.test(value) ? value.replace(',', '.') : value;
}

export function sanitizeDecimalInput(value: string, maxDecimals: number): string {
  const normalized = normalizeDecimalSeparator(value);
  // Keep malformed pasted text visible so validation rejects it; never turn 1e3 into 13.
  if (!/^\d*(?:\.\d*)?$/.test(normalized)) return value;
  if (!normalized) return '';
  const safeDecimals = Number.isFinite(maxDecimals) ? Math.max(0, Math.floor(maxDecimals)) : 0;
  const hasDot = normalized.includes('.');
  const [whole = '', fraction = ''] = normalized.split('.');
  const wholePart = whole.replace(/^0+(?=\d)/, '');
  if (!hasDot) return wholePart;
  if (safeDecimals === 0) return wholePart || '0';
  return `${wholePart || '0'}.${fraction.slice(0, safeDecimals)}`;
}

export function normalizeDecimalInputForSubmit(value: string, maxDecimals: number): string {
  const normalized = sanitizeDecimalInput(value, maxDecimals);
  return /^\d*(?:\.\d*)?$/.test(normalized) ? normalized.replace(/\.$/, '') : normalized;
}
