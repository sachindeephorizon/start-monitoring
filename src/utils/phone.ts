export const INDIA_COUNTRY_CODE = '+91';

/**
 * Normalizes user input into an India E.164-ish string: "+91" + up to 10 digits.
 * - Preserves only digits after the prefix
 * - If user pastes "91XXXXXXXXXX" or "+91XXXXXXXXXX", it keeps the last 10 digits
 * - If user clears the field, it returns "+91" so the prefix stays visible
 */
export function normalizeIndianPhoneInput(raw: string): string {
  const rawStr = String(raw ?? '');
  const trimmed = rawStr.trim();
  const hasPlusPrefix = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return INDIA_COUNTRY_CODE;

  // If the user is typing into a field that already shows "+91", the raw input will naturally
  // include "91" in the digits. We must strip that, otherwise we end up duplicating: "+9191..."
  if (hasPlusPrefix && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  // If there is no "+" but the user pasted a full number like "91XXXXXXXXXX" (or longer),
  // treat the leading 91 as country code.
  if (!hasPlusPrefix && digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  }

  // Keep only up to 10 digits (India national number length).
  const national = digits.slice(0, 10);
  return `${INDIA_COUNTRY_CODE}${national}`;
}

/**
 * Returns a full E.164 phone number (+91XXXXXXXXXX) or null if incomplete.
 */
export function indianPhoneToE164(raw: string): string | null {
  const normalized = normalizeIndianPhoneInput(raw);
  const digits = normalized.replace(/\D/g, ''); // "91" + up to 10 digits
  if (digits.length !== 12) return null;
  return `+${digits}`;
}

